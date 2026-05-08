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

function isBlockedBucketRead(error) {
  const message = String(error?.message || '').toLowerCase()
  const statusCode = Number(error?.statusCode || error?.status)

  return (
    statusCode === 401 ||
    statusCode === 403 ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('permission') ||
    message.includes('not allowed') ||
    message.includes('invalid schema') ||
    message.includes('row-level security')
  )
}

function isPrivateBucketHiddenFromAnon(error, keyMode) {
  const message = String(error?.message || '').toLowerCase()

  return keyMode === 'anon' && message.includes('bucket not found')
}

async function checkBucket(supabase, keyMode) {
  const storageApiResult = await supabase.storage.getBucket(MANUALS_BUCKET_ID)
  const metadataResult = await supabase
    .schema('storage')
    .from('buckets')
    .select('id, name, public')
    .eq('id', MANUALS_BUCKET_ID)
    .maybeSingle()

  const storageApiError = storageApiResult.error
  const metadataError = metadataResult.error
  const apiBucket = storageApiResult.data
  const metadataBucket = metadataResult.data

  if (apiBucket) {
    return {
      exists: apiBucket.id === MANUALS_BUCKET_ID || apiBucket.name === MANUALS_BUCKET_ID,
      isPrivate: apiBucket.public === false,
      storageApiStatus: 'confirmed by Storage API',
      metadataStatus: metadataBucket ? 'visible in DB metadata' : 'not checked or not visible',
      isBlocked: false,
      error: null,
    }
  }

  if (metadataBucket) {
    return {
      exists: metadataBucket.id === MANUALS_BUCKET_ID || metadataBucket.name === MANUALS_BUCKET_ID,
      isPrivate: metadataBucket.public === false,
      storageApiStatus: storageApiError && (isBlockedBucketRead(storageApiError) || isPrivateBucketHiddenFromAnon(storageApiError, keyMode))
        ? 'not readable with this key'
        : `not confirmed${storageApiError?.message ? `; ${storageApiError.message}` : ''}`,
      metadataStatus: 'visible in DB metadata',
      isBlocked: Boolean(storageApiError && (isBlockedBucketRead(storageApiError) || isPrivateBucketHiddenFromAnon(storageApiError, keyMode))),
      error: null,
    }
  }

  if (storageApiError || metadataError) {
    const blocked =
      isBlockedBucketRead(storageApiError) ||
      isBlockedBucketRead(metadataError) ||
      isPrivateBucketHiddenFromAnon(storageApiError, keyMode)

    return {
      exists: blocked ? null : false,
      isPrivate: null,
      storageApiStatus: storageApiError && (isBlockedBucketRead(storageApiError) || isPrivateBucketHiddenFromAnon(storageApiError, keyMode))
        ? 'not readable with this key'
        : `not confirmed${storageApiError?.message ? `; ${storageApiError.message}` : ''}`,
      metadataStatus: metadataError && isBlockedBucketRead(metadataError)
        ? 'not readable with this key'
        : `not visible${metadataError?.message ? `; ${metadataError.message}` : ''}`,
      isBlocked: blocked,
      error: blocked ? null : storageApiError?.message || metadataError?.message || null,
    }
  }

  return {
    exists: false,
    isPrivate: null,
    storageApiStatus: 'bucket not found',
    metadataStatus: 'bucket not found',
    isBlocked: false,
    error: null,
  }
}

async function main() {
  const env = await loadEnv()
  const supabaseUrl = env.VITE_SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  const readKey = serviceRoleKey || anonKey
  const keyMode = serviceRoleKey ? 'service role' : 'anon'
  let hasProblems = false

  process.stdout.write('MANUAL PIPELINE CHECK v5.9\n')

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
  const bucketCheck = await checkBucket(supabase, keyMode)

  printStatus('Storage API', bucketCheck.storageApiStatus)
  printStatus('DB metadata', bucketCheck.metadataStatus)

  if (bucketCheck.error) {
    hasProblems = true
    printStatus('manuals bucket', `not confirmed; ${bucketCheck.error}`)
  } else if (bucketCheck.isBlocked && bucketCheck.exists !== true) {
    printStatus('manuals bucket', 'not readable with current key; bucket existence not treated as failed by this check')
  } else {
    printStatus('manuals bucket exists', bucketCheck.exists ? 'yes' : 'no')
    printStatus('manuals bucket private', bucketCheck.isPrivate ? 'yes' : 'no')
    hasProblems = hasProblems || bucketCheck.exists === false || bucketCheck.isPrivate === false
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

  const bucketNeedsAction =
    bucketCheck.error ||
    bucketCheck.exists === false ||
    bucketCheck.isPrivate === false

  if (bucketNeedsAction) {
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
