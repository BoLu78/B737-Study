import fs from 'node:fs/promises'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const ENV_PATH = '.env.local'
const SAMPLE_QUERIES = [
  'speed trim',
  'hydraulic',
  'rejected takeoff',
  'autopilot',
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

function printSection(title) {
  process.stdout.write(`\n${title}\n`)
}

function summarizeChunk(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

async function main() {
  printSection('MANUAL SEARCH CHECK v6.3')

  const env = await loadEnv()
  const supabaseUrl = env.VITE_SUPABASE_URL
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(`${ENV_PATH} must include VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.`)
  }

  process.stdout.write('- Supabase URL: configured\n')
  process.stdout.write('- Supabase anon key: configured, value hidden\n')

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  for (const query of SAMPLE_QUERIES) {
    printSection(`QUERY: ${query}`)

    const { data, error } = await supabase.rpc('search_manual_chunks', {
      search_query: query,
      aircraft_filter: null,
      manual_type_filter: null,
      result_limit: 5,
    })

    if (error) {
      process.stdout.write(`- RPC error: ${error.message}\n`)
      continue
    }

    if (!data?.length) {
      process.stdout.write('- No results\n')
      continue
    }

    data.forEach((row, index) => {
      const rankScore = Number.isFinite(Number(row.rank_score))
        ? Number(row.rank_score).toFixed(2)
        : 'n/a'

      process.stdout.write(
        `${index + 1}. ${row.manual_code || 'unknown'} page ${row.page_number ?? 'n/a'} ` +
        `rank ${rankScore}: ${summarizeChunk(row.chunk_text)}\n`,
      )
    })
  }
}

main().catch((error) => {
  process.stderr.write(`Manual search check failed: ${error.message}\n`)
  process.exitCode = 1
})
