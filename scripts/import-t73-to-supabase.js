import fs from 'node:fs/promises'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const ENV_PATH = '.env.local'
const INPUT_PATH = 'data/generated/t73_r01_questions.json'
const BATCH_SIZE = 100

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

    const key = trimmed.slice(0, separatorIndex)
    const value = trimmed.slice(separatorIndex + 1).replace(/^['"]|['"]$/g, '')
    env[key] = value
  }

  return env
}

function isRlsError(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('row-level security') || message.includes('violates row-level security')
}

async function main() {
  try {
    const env = parseEnv(await fs.readFile(ENV_PATH, 'utf8'))
    const rows = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'))
    const supabaseUrl = env.VITE_SUPABASE_URL
    const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase is not configured. Check environment variables.')
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('No rows found in generated T73 JSON.')
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    let importedRows = 0

    for (let index = 0; index < rows.length; index += BATCH_SIZE) {
      const batch = rows.slice(index, index + BATCH_SIZE)
      const { data, error } = await supabase
        .from('questions')
        .upsert(batch, {
          onConflict: 'source_document,source_revision,source_id',
          ignoreDuplicates: false,
        })
        .select('id')

      if (error) {
        if (isRlsError(error)) {
          console.error('Import blocked by Supabase RLS. This is expected until secure admin write access is configured.')
          console.log(`rows attempted: ${rows.length}`)
          console.log(`rows imported/updated: ${importedRows}`)
          process.exit(1)
        }

        console.error(`Import error: ${error.message}`)
        console.log(`rows attempted: ${rows.length}`)
        console.log(`rows imported/updated: ${importedRows}`)
        process.exit(1)
      }

      importedRows += data?.length || batch.length
    }

    console.log(`rows attempted: ${rows.length}`)
    console.log(`rows imported/updated: ${importedRows}`)
  } catch (error) {
    if (error.code === 'ENOENT' && error.path === INPUT_PATH) {
      console.error('Generated JSON is missing. Run npm run extract:t73 first.')
      process.exit(1)
    }

    console.error(error.message)
    process.exit(1)
  }
}

main()
