import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const INPUT_PATH = 'data/generated/t73_r01_questions.json'
const OUTPUT_PATH = 'data/generated/t73_r01_questions_insert.sql'
const COLUMNS = [
  'topic',
  'subtopic',
  'question',
  'answer_a',
  'answer_b',
  'answer_c',
  'answer_d',
  'correct_answer',
  'explanation',
  'manual_reference',
  'source_document',
  'source_revision',
  'source_id',
  'source_page',
  'status',
  'difficulty',
  'import_batch',
]
const NULLABLE_COLUMNS = new Set(['subtopic', 'source_page'])

function normalizeSqlText(value) {
  return String(value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sqlValue(value, columnName) {
  if (value === null || value === undefined || (value === '' && NULLABLE_COLUMNS.has(columnName))) {
    return 'NULL'
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL'
  }

  const escapedValue = normalizeSqlText(value).replaceAll("'", "''")
  return `'${escapedValue}'`
}

function validateSql(sql) {
  const checks = [
    [sql.trim().startsWith('insert into public.questions'), 'SQL must start with insert into public.questions.'],
    [
      sql.includes('on conflict (source_document, source_revision, source_id) do update'),
      'SQL must contain the expected on conflict clause.',
    ],
    [!sql.includes('undefined'), 'SQL contains undefined.'],
    [!sql.includes('[object Object]'), 'SQL contains [object Object].'],
    [!/\$\{[^}]+}/.test(sql), 'SQL contains an unresolved template placeholder.'],
  ]

  const failedCheck = checks.find(([isValid]) => !isValid)

  if (failedCheck) {
    throw new Error(failedCheck[1])
  }
}

function buildInsert(rows) {
  const values = rows
    .map((row) => `  (${COLUMNS.map((column) => sqlValue(row[column], column)).join(', ')})`)
    .join(',\n')

  return `insert into public.questions (${COLUMNS.join(', ')})\nvalues\n${values}\non conflict (source_document, source_revision, source_id) do update set\n  topic = excluded.topic,\n  subtopic = excluded.subtopic,\n  question = excluded.question,\n  answer_a = excluded.answer_a,\n  answer_b = excluded.answer_b,\n  answer_c = excluded.answer_c,\n  answer_d = excluded.answer_d,\n  correct_answer = excluded.correct_answer,\n  explanation = excluded.explanation,\n  manual_reference = excluded.manual_reference,\n  source_page = excluded.source_page,\n  status = excluded.status,\n  difficulty = excluded.difficulty,\n  import_batch = excluded.import_batch,\n  updated_at = now();\n`
}

async function main() {
  try {
    const rows = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'))

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('No rows found in generated T73 JSON.')
    }

    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
    const sql = buildInsert(rows)
    validateSql(sql)
    await fs.writeFile(OUTPUT_PATH, sql)
    console.log(`rows written: ${rows.length}`)
    console.log(`output path: ${OUTPUT_PATH}`)
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('Generated JSON is missing. Run npm run extract:t73 first.')
      process.exit(1)
    }

    console.error(error.message)
    process.exit(1)
  }
}

main()
