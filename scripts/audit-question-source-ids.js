import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/* global process */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const questionJsonPath = path.join(repoRoot, 'data/generated/questions.json')
const reportPath = path.join(repoRoot, 'data/generated/question_source_id_audit_v8.2.md')

async function loadQuestions() {
  try {
    const fileText = await fs.readFile(questionJsonPath, 'utf8')
    return {
      questions: JSON.parse(fileText),
      source: path.relative(repoRoot, questionJsonPath),
    }
  } catch {
    return { questions: [], source: 'No question source available' }
  }
}

function getSourceId(question) {
  return question.source_id ?? question.sourceQuestionId ?? question.sourceId ?? question.id ?? null
}

function getSourceDocument(question) {
  return question.source_document ?? question.sourceDocument ?? 'questions.csv'
}

function getSourceRevision(question) {
  return question.source_revision ?? question.sourceRevision ?? 'v8.2'
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
    '# Question Source ID Audit v8.2',
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
  lines.push('Use generated question `id` as the user-facing CSV/source question number. Keep any storage/runtime keys internal only.')
  lines.push('')

  return `${lines.join('\n')}\n`
}

async function main() {
  const questionSource = await loadQuestions()
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
