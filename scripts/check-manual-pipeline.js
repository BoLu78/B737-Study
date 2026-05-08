import fs from 'node:fs/promises'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const ENV_PATH = '.env.local'
const MANUALS_BUCKET_ID = 'manuals'

function parseEnv(content) {
  const env = {}

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')

    if (separatorIndex === -1) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '')
    env[key] = value
  }

  return env
}

function printSection(title) {
  process.stdout.write(`\n${title}\n`)
}

function printStatus(label, value) {
  process.stdout.write(`- ${label}: ${value}\n`)
}

function getMissingManualFields(manual) {
  return ['code', 'title', 'storage_bucket', 'storage_path', 'status'].filter((field) => {
    const value = manual[field]
    return value === null || value === undefined || String(value).trim() === ''
  })
}

async function loadEnv() {
  try {
    return parseEnv(await fs.readFile(ENV_PATH, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`${ENV_PATH} was not found. Create it with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.`, {
        cause: error,
      })
    }

    throw error
  }
}

async function checkBucket(supabase) {
  const { data, error } = await supabase.storage.getBucket(MANUALS_BUCKET_ID)

  if (error) {
    return {
      exists: false,
      isPrivate: null,
      error: error.message,
    }
  }

  return {
    exists: data?.id === MANUALS_BUCKET_ID || data?.name === MANUALS_BUCKET_ID,
    isPrivate: data?.public === false,
    error: null,
  }
}

async function main() {
  const env = await loadEnv()
  const supabaseUrl = env.VITE_SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  const readKey = serviceRoleKey || anonKey
  let hasProblems = false

  process.stdout.write('MANUAL PIPELINE CHECK v3.9\n')

  printSection('SUPABASE CONNECTION')
  printStatus('URL configured', supabaseUrl ? 'yes' : 'no')
  printStatus('Anon key configured', anonKey ? 'yes' : 'no')
  printStatus('Storage metadata key', serviceRoleKey ? 'service role key present, value hidden' : 'anon key, value hidden')

  if (!supabaseUrl || !readKey) {
    printStatus('Connection', 'failed; missing Supabase URL or key')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, readKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const catalogResult = await supabase
    .from('manual_documents')
    .select('id, code, title, storage_bucket, storage_path, status', { count: 'exact' })
    .eq('status', 'active')
    .order('code', { ascending: true })

  if (catalogResult.error) {
    hasProblems = true
    printStatus('Connection', `failed; ${catalogResult.error.message}`)
  } else {
    printStatus('Connection', 'ok')
  }

  const activeManuals = catalogResult.data || []

  printSection('MANUAL CATALOG')
  if (catalogResult.error) {
    printStatus('Active manual rows', 'unknown')
  } else {
    printStatus('Active manual rows', String(catalogResult.count ?? activeManuals.length))
    if (activeManuals.length === 0) {
      hasProblems = true
    }
  }

  printSection('STORAGE BUCKET')
  const bucketCheck = await checkBucket(supabase)

  if (bucketCheck.error) {
    hasProblems = true
    printStatus('manuals bucket', `not confirmed; ${bucketCheck.error}`)
  } else {
    printStatus('manuals bucket exists', bucketCheck.exists ? 'yes' : 'no')
    printStatus('manuals bucket private', bucketCheck.isPrivate ? 'yes' : 'no')
    hasProblems = hasProblems || !bucketCheck.exists || !bucketCheck.isPrivate
  }

  printSection('MANUAL FILE PATHS')
  if (activeManuals.length === 0) {
    printStatus('Path validation', 'no active manuals to check')
  } else {
    const invalidManuals = activeManuals
      .map((manual) => ({
        code: manual.code || `id:${manual.id}`,
        missingFields: getMissingManualFields(manual),
      }))
      .filter((manual) => manual.missingFields.length > 0)

    if (invalidManuals.length === 0) {
      printStatus('Required path fields', 'ok')
    } else {
      hasProblems = true
      printStatus('Required path fields', 'missing values found')
      invalidManuals.forEach((manual) => {
        printStatus(manual.code, `missing ${manual.missingFields.join(', ')}`)
      })
    }

    const nonManualBucketRows = activeManuals.filter((manual) => manual.storage_bucket !== MANUALS_BUCKET_ID)
    printStatus('Rows pointing at manuals bucket', `${activeManuals.length - nonManualBucketRows.length}/${activeManuals.length}`)

    if (nonManualBucketRows.length > 0) {
      hasProblems = true
    }
  }

  printSection('MANUAL CHUNKS')
  const chunkResult = await supabase
    .from('manual_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')

  if (chunkResult.error) {
    hasProblems = true
    printStatus('Active chunk rows', `unknown; ${chunkResult.error.message}`)
  } else {
    const chunkCount = chunkResult.count ?? 0
    printStatus('Active chunk rows', String(chunkCount))
    if (chunkCount === 0) {
      hasProblems = true
    }
  }

  printSection('NEXT REQUIRED ACTION')
  if (!hasProblems) {
    printStatus('Pipeline status', 'catalog, private bucket, paths, and chunks are present')
    printStatus('AI status', 'not enabled; add a secure backend function before enabling Ask manuals')
    return
  }

  if (activeManuals.length === 0) {
    printStatus('Catalog', 'apply migration 009 or seed verified manual_documents rows')
  }

  if (bucketCheck.error || !bucketCheck.exists || !bucketCheck.isPrivate) {
    printStatus('Storage', 'apply migration 009 and verify the private manuals bucket')
  }

  if (chunkResult.error || (chunkResult.count ?? 0) === 0) {
    printStatus('Chunks', 'run local indexing, review generated SQL, then import manual_chunks')
  }

  process.exit(1)
}

main().catch((error) => {
  process.stderr.write(`Manual pipeline check failed: ${error.message}\n`)
  process.exit(1)
})
