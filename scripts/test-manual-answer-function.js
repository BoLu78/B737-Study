import fs from 'node:fs/promises'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const ENV_PATH = '.env.local'
const TEST_QUESTION = 'Explain the Speed Trim System'

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

function summarizeAnswer(answer) {
  return String(answer || '').replace(/\s+/g, ' ').trim().slice(0, 700)
}

async function main() {
  process.stdout.write('MANUAL AI ANSWER FUNCTION CHECK v6.4\n')

  const env = await loadEnv()
  const supabaseUrl = env.VITE_SUPABASE_URL
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
  const email = env.MANUAL_TEST_EMAIL || env.VITE_MANUAL_TEST_EMAIL
  const password = env.MANUAL_TEST_PASSWORD || env.VITE_MANUAL_TEST_PASSWORD

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(`${ENV_PATH} must include VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.`)
  }

  if (!email || !password) {
    throw new Error(
      `${ENV_PATH} must include MANUAL_TEST_EMAIL and MANUAL_TEST_PASSWORD for this authenticated function check. Secret values are never printed.`,
    )
  }

  process.stdout.write('- Supabase URL: configured\n')
  process.stdout.write('- Supabase anon key: configured, value hidden\n')
  process.stdout.write('- Test user credentials: configured, values hidden\n')
  process.stdout.write('- OpenAI key: not needed locally; it must be set as a Supabase secret for the deployed function\n')

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (signInError || !signInData.session?.access_token) {
    throw new Error('Unable to sign in test user.')
  }

  const { data, error } = await supabase.functions.invoke('manual-answer', {
    body: {
      question: TEST_QUESTION,
      aircraft: null,
      manual_type: null,
    },
    headers: {
      Authorization: `Bearer ${signInData.session.access_token}`,
    },
  })

  if (error) {
    throw new Error(error.message || 'manual-answer function returned an error.')
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  process.stdout.write(`\nQuestion: ${TEST_QUESTION}\n`)
  process.stdout.write(`Model: ${data.model || 'n/a'}\n`)
  process.stdout.write(`Used chunks: ${data.used_chunks ?? 'n/a'}\n`)
  process.stdout.write(`Answer summary: ${summarizeAnswer(data.answer)}\n`)

  if (Array.isArray(data.citations) && data.citations.length > 0) {
    process.stdout.write('\nCitations:\n')
    data.citations.forEach((citation, index) => {
      process.stdout.write(
        `${index + 1}. ${citation.title || citation.manual_code || 'Unknown manual'} ` +
        `page ${citation.page_number ?? 'n/a'}, chunk ${citation.chunk_index ?? 'n/a'}\n`,
      )
    })
  } else {
    process.stdout.write('\nCitations: none returned\n')
  }
}

main().catch((error) => {
  process.stderr.write(`Manual AI answer function check failed: ${error.message}\n`)
  process.exitCode = 1
})
