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

function sqlValue(value) {
  if (value === null || value === undefined) {
    return 'null'
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'null'
  }

  return `'${String(value).replaceAll("'", "''")}'`
}

function buildInsert(rows) {
  const values = rows
    .map((row) => `  (${COLUMNS.map((column) => sqlValue(row[column])).join(', ')})`)
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
    await fs.writeFile(OUTPUT_PATH, buildInsert(rows))
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
