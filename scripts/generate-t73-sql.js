import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const INPUT_PATH = 'data/generated/t73_r01_questions.json'
const OUTPUT_PATH = 'data/generated/t73_r01_questions_insert.sql'
const JSON_RECORDSET_COLUMNS = [
  ['source_id', 'integer'],
  ['topic', 'text'],
  ['subtopic', 'text'],
  ['question', 'text'],
  ['answer_a', 'text'],
  ['answer_b', 'text'],
  ['answer_c', 'text'],
  ['answer_d', 'text'],
  ['correct_answer', 'text'],
  ['explanation', 'text'],
  ['manual_reference', 'text'],
  ['source_document', 'text'],
  ['source_revision', 'text'],
  ['source_page', 'integer'],
  ['status', 'text'],
  ['difficulty', 'text'],
  ['import_batch', 'text'],
]
const INSERT_COLUMNS = [
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
const DOLLAR_QUOTE_DELIMITER = 'T73_JSON_PAYLOAD_V47'

function validateSql(sql) {
  const checks = [
    [sql.trim().startsWith('with payload as'), 'SQL must start with the payload CTE.'],
    [sql.includes('jsonb_to_recordset'), 'SQL must load rows with jsonb_to_recordset.'],
    [!/\nvalues\s*\n\(/i.test(sql), 'SQL must not contain raw VALUES rows.'],
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

function getDollarQuoteDelimiter(jsonPayload) {
  const delimiter = `$${DOLLAR_QUOTE_DELIMITER}$`

  if (jsonPayload.includes(delimiter)) {
    throw new Error(`JSON payload contains the dollar quote delimiter ${delimiter}.`)
  }

  return delimiter
}

function buildInsert(rows) {
  const jsonPayload = JSON.stringify(rows, null, 2)
  const dollarQuoteDelimiter = getDollarQuoteDelimiter(jsonPayload)
  const recordsetColumns = JSON_RECORDSET_COLUMNS.map(([column, type]) => `    ${column} ${type}`).join(',\n')

  return `with payload as (
  select *
  from jsonb_to_recordset(${dollarQuoteDelimiter}
${jsonPayload}
${dollarQuoteDelimiter}::jsonb) as x(
${recordsetColumns}
  )
)
insert into public.questions (
  ${INSERT_COLUMNS.join(',\n  ')}
)
select
  ${INSERT_COLUMNS.join(',\n  ')}
from payload
on conflict (source_document, source_revision, source_id) do update set
  topic = excluded.topic,
  subtopic = excluded.subtopic,
  question = excluded.question,
  answer_a = excluded.answer_a,
  answer_b = excluded.answer_b,
  answer_c = excluded.answer_c,
  answer_d = excluded.answer_d,
  correct_answer = excluded.correct_answer,
  explanation = excluded.explanation,
  manual_reference = excluded.manual_reference,
  source_page = excluded.source_page,
  status = excluded.status,
  difficulty = excluded.difficulty,
  import_batch = excluded.import_batch,
  updated_at = now();
`
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
