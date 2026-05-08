import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const ENV_PATH = '.env.local'
const MANIFEST_PATH = 'data/manuals-local/manuals-manifest.json'
const MISSING_REPORT_PATH = 'data/generated/manual_local_missing_v5.9.md'

const REQUIRED_MANUALS = [
  {
    code: 'B737-MAX-FCOM-V1',
    local_pdf_path: 'data/manuals-local/B737/B737 MAX/B737_MAX_FCOM_V1.pdf',
  },
  {
    code: 'B737-MAX-FCOM-V2',
    local_pdf_path: 'data/manuals-local/B737/B737 MAX/B737_MAX_FCOM_V2.pdf',
  },
  {
    code: 'B737-MAX-MEL',
    local_pdf_path: 'data/manuals-local/B737/B737 MAX/B737_MAX_MEL_NTP23_R06B_R06B.pdf',
  },
  {
    code: 'B737-MAX-QRH',
    local_pdf_path: 'data/manuals-local/B737/B737 MAX/B737_MAX_QRH.pdf',
  },
  {
    code: 'B737-NG-FCOM-V1',
    local_pdf_path: 'data/manuals-local/B737/B737 NG/B737_NG_FCOM_V1.pdf',
  },
  {
    code: 'B737-NG-FCOM-V2',
    local_pdf_path: 'data/manuals-local/B737/B737 NG/B737_NG_FCOM_V2.pdf',
  },
  {
    code: 'B737-NG-MEL',
    local_pdf_path: 'data/manuals-local/B737/B737 NG/B737_NG_MEL_R52.pdf',
  },
  {
    code: 'B737-NG-QRH',
    local_pdf_path: 'data/manuals-local/B737/B737 NG/B737_NG_QRH.pdf',
  },
  {
    code: 'B737-NG-MAX-FCTM',
    local_pdf_path: 'data/manuals-local/B737/FCTM/B737_NG_MAX_FCTM.pdf',
  },
]

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

function isExactPdfPath(expectedPath) {
  return path.extname(expectedPath) === '.pdf' && expectedPath === path.normalize(expectedPath)
}

async function readEnvIfAvailable() {
  try {
    return parseEnv(await fs.readFile(ENV_PATH, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }

    throw error
  }
}

async function loadSupabaseManualCodes(env) {
  if (!env?.VITE_SUPABASE_URL || !env?.VITE_SUPABASE_ANON_KEY) {
    return {
      source: 'fallback',
      codes: null,
      error: 'Supabase env vars not available; using required local map.',
    }
  }

  const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data, error } = await supabase
    .from('manual_documents')
    .select('code, status')
    .eq('status', 'active')
    .order('code', { ascending: true })

  if (error) {
    return {
      source: 'fallback',
      codes: null,
      error: `Supabase catalog query failed; using required local map. ${error.message}`,
    }
  }

  return {
    source: 'supabase',
    codes: new Set((data || []).map((manual) => manual.code).filter(Boolean)),
    error: null,
  }
}

async function pathExists(filePath) {
  try {
    const stats = await fs.stat(filePath)
    return stats.isFile()
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false
    }

    throw error
  }
}

async function writeMissingReport({ missingManuals, invalidPathManuals, catalogMissingManuals, catalogSource }) {
  await fs.mkdir(path.dirname(MISSING_REPORT_PATH), { recursive: true })

  const lines = [
    '# Local Manual PDF Missing Report v5.9',
    '',
    '## CURRENT STATUS',
    '',
    'Local manual manifest generation did not complete because required local PDFs or catalog codes are missing.',
    '',
    '## CATALOG SOURCE',
    '',
    `- ${catalogSource}`,
    '',
    '## MISSING LOCAL PDFS',
    '',
    ...(
      missingManuals.length > 0
        ? missingManuals.map((manual) => `- ${manual.local_pdf_path}`)
        : ['- none']
    ),
    '',
    '## INVALID LOCAL PDF PATHS',
    '',
    ...(
      invalidPathManuals.length > 0
        ? invalidPathManuals.map((manual) => `- ${manual.local_pdf_path}`)
        : ['- none']
    ),
    '',
    '## MISSING ACTIVE SUPABASE CATALOG CODES',
    '',
    ...(
      catalogMissingManuals.length > 0
        ? catalogMissingManuals.map((manual) => `- ${manual.code}`)
        : ['- none']
    ),
    '',
    '## NEXT REQUIRED ACTION',
    '',
    'Place the missing PDFs at the exact paths above, verify active manual catalog rows in Supabase if needed, then rerun `npm run manuals:manifest`.',
    '',
  ]

  await fs.writeFile(MISSING_REPORT_PATH, lines.join('\n'))
}

async function main() {
  process.stdout.write('LOCAL MANUAL MANIFEST PREP v5.9\n')

  const env = await readEnvIfAvailable()
  const catalogResult = await loadSupabaseManualCodes(env)
  const foundManuals = []
  const missingManuals = []
  const invalidPathManuals = []
  const catalogMissingManuals = []

  for (const manual of REQUIRED_MANUALS) {
    if (!isExactPdfPath(manual.local_pdf_path)) {
      invalidPathManuals.push(manual)
      continue
    }

    if (!(await pathExists(manual.local_pdf_path))) {
      missingManuals.push(manual)
      continue
    }

    foundManuals.push(manual)
  }

  if (catalogResult.codes) {
    REQUIRED_MANUALS.forEach((manual) => {
      if (!catalogResult.codes.has(manual.code)) {
        catalogMissingManuals.push(manual)
      }
    })
  }

  printSection('FOUND LOCAL PDFS')
  foundManuals.forEach((manual) => {
    printStatus(manual.code, manual.local_pdf_path)
  })
  if (foundManuals.length === 0) {
    printStatus('count', '0')
  }

  printSection('MISSING LOCAL PDFS')
  missingManuals.forEach((manual) => {
    printStatus(manual.code, manual.local_pdf_path)
  })
  if (missingManuals.length === 0) {
    printStatus('count', '0')
  }

  if (catalogResult.error) {
    printStatus('Catalog source', catalogResult.error)
  } else {
    printStatus('Catalog source', 'Supabase active manual catalog queried successfully.')
  }

  if (catalogMissingManuals.length > 0) {
    printStatus('Missing active catalog codes', catalogMissingManuals.map((manual) => manual.code).join(', '))
  }

  if (missingManuals.length > 0 || invalidPathManuals.length > 0 || catalogMissingManuals.length > 0) {
    await writeMissingReport({
      missingManuals,
      invalidPathManuals,
      catalogMissingManuals,
      catalogSource: catalogResult.source === 'supabase'
        ? 'Supabase active manual catalog'
        : 'Required 9-code local fallback map',
    })

    printSection('GENERATED MANIFEST')
    printStatus('status', 'not generated')
    printStatus('missing report', MISSING_REPORT_PATH)

    printSection('NEXT COMMAND')
    printStatus('after fixing missing files', 'npm run manuals:manifest')
    process.exit(1)
  }

  const manifest = REQUIRED_MANUALS.map((manual) => ({
    manual_document_code: manual.code,
    local_pdf_path: manual.local_pdf_path,
  }))

  await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true })
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)

  printSection('GENERATED MANIFEST')
  printStatus('path', MANIFEST_PATH)
  printStatus('entries', String(manifest.length))

  printSection('NEXT COMMAND')
  printStatus('dry run', 'npm run manuals:index:dry')
}

main().catch((error) => {
  process.stderr.write(`Local manual manifest prep failed: ${error.message}\n`)
  process.exit(1)
})
