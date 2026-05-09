import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

/* global process */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const fallbackJsonPath = path.join(repoRoot, 'data/generated/t73_r01_questions.json')
const reportPath = path.join(repoRoot, 'data/generated/question_source_id_audit_v7.5.md')

async function readDotEnvLocal() {
  const envPath = path.join(repoRoot, '.env.local')

  try {
    const envText = await fs.readFile(envPath, 'utf8')
    return Object.fromEntries(
      envText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const separatorIndex = line.indexOf('=')
          const key = line.slice(0, separatorIndex).trim()
          const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '')
          return [key, value]
        }),
    )
  } catch {
    return {}
  }
}

async function loadQuestionsFromSupabase(envValues) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || envValues.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || envValues.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return { questions: null, source: null }
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data, error } = await supabase
    .from('questions')
    .select('id, source_id, source_document, source_revision, question')
    .eq('status', 'active')
    .order('id', { ascending: true })

  if (error) {
    return { questions: null, source: `Supabase unavailable: ${error.message}` }
  }

  return { questions: data || [], source: 'Supabase questions table' }
}

async function loadFallbackQuestions() {
  try {
    const fileText = await fs.readFile(fallbackJsonPath, 'utf8')
    return {
      questions: JSON.parse(fileText),
      source: path.relative(repoRoot, fallbackJsonPath),
    }
  } catch {
    return { questions: [], source: 'No question source available' }
  }
}

function getSourceId(question) {
  return question.source_id ?? question.sourceQuestionId ?? question.sourceId ?? null
}

function getSourceDocument(question) {
  return question.source_document ?? question.sourceDocument ?? 'unknown document'
}

function getSourceRevision(question) {
  return question.source_revision ?? question.sourceRevision ?? 'unknown revision'
}

function getInternalId(question) {
  return question.id ?? 'local-json'
}

function auditSourceIds(questions) {
  const withSourceId = questions.filter((question) => Number.isInteger(Number(getSourceId(question))))
  const missingSourceId = questions.filter((question) => !Number.isInteger(Number(getSourceId(question))))
  const grouped = new Map()

  withSourceId.forEach((question) => {
    const groupKey = `${getSourceDocument(question)} | ${getSourceRevision(question)} | ${getSourceId(question)}`
    const current = grouped.get(groupKey) || []
    current.push(question)
    grouped.set(groupKey, current)
  })

  const duplicates = Array.from(grouped.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, rows }))

  return {
    total: questions.length,
    withSourceId,
    missingSourceId,
    duplicates,
  }
}

function renderReport({ source, audit }) {
  const lines = [
    '# Question Source ID Audit v7.5',
    '',
    '## Summary',
    '',
    `- Source: ${source}`,
    `- Total questions: ${audit.total}`,
    `- Questions with source question ID: ${audit.withSourceId.length}`,
    `- Questions missing source question ID: ${audit.missingSourceId.length}`,
    `- Duplicate source question IDs within same source document/revision: ${audit.duplicates.length}`,
    '',
    '## Missing Source Question IDs',
    '',
  ]

  if (audit.missingSourceId.length === 0) {
    lines.push('No missing source question IDs found.', '')
  } else {
    audit.missingSourceId.slice(0, 25).forEach((question) => {
      lines.push(`- Internal ID: ${getInternalId(question)}`)
      lines.push(`  - Source document: ${getSourceDocument(question)}`)
      lines.push(`  - Question: ${question.question || '—'}`)
    })
    lines.push('')
  }

  lines.push('## Duplicate Source Question IDs', '')

  if (audit.duplicates.length === 0) {
    lines.push('No duplicate source question IDs found within the same source document/revision.', '')
  } else {
    audit.duplicates.slice(0, 25).forEach((duplicate) => {
      lines.push(`- ${duplicate.key}`)
      duplicate.rows.forEach((row) => {
        lines.push(`  - Internal ID: ${getInternalId(row)} | Question: ${row.question || '—'}`)
      })
    })
    lines.push('')
  }

  lines.push('## Recommendation')
  lines.push('')
  lines.push('Use `source_id` as the user-facing NEOS/PDF question number. Keep Supabase row `id` internal for database/state keys only.')
  lines.push('')

  return `${lines.join('\n')}\n`
}

async function main() {
  const envValues = await readDotEnvLocal()
  const supabaseResult = await loadQuestionsFromSupabase(envValues)
  const questionSource = supabaseResult.questions ? supabaseResult : await loadFallbackQuestions()
  const audit = auditSourceIds(questionSource.questions)
  const report = renderReport({ source: questionSource.source, audit })

  await fs.mkdir(path.dirname(reportPath), { recursive: true })
  await fs.writeFile(reportPath, report)

  console.log(`Scanned ${audit.total} questions from ${questionSource.source}.`)
  console.log(`With source question ID: ${audit.withSourceId.length}.`)
  console.log(`Missing source question ID: ${audit.missingSourceId.length}.`)
  console.log(`Duplicate source question IDs: ${audit.duplicates.length}.`)
  console.log(`Wrote ${path.relative(repoRoot, reportPath)}.`)
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
