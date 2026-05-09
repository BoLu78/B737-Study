import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const inputPath = path.join(repoRoot, 'data/import/questions.csv')
const outputPath = path.join(repoRoot, 'data/generated/questions.json')

const REQUIRED_HEADERS = ['ID', 'Question', 'AnswerOne', 'AnswerTwo', 'AnswerThree', 'AnswerFour', 'Correct', 'Argument']
const ANSWER_COLUMNS = ['AnswerOne', 'AnswerTwo', 'AnswerThree', 'AnswerFour']
const ANSWER_KEYS = ['A', 'B', 'C', 'D']
const SHORT_ANSWER_WHITELIST = new Set([
  'true',
  'false',
  'yes',
  'no',
  'on',
  'off',
  'auto',
  'vnav',
  'lnav',
  'app',
  'v/s',
  'mcp',
  'fmc',
  'fcc',
  'gpws',
  'cws p',
  'system a',
  'system b',
  'class a',
  'class b',
  'class c',
  'class d',
  'a',
  'b',
  'c',
  'd',
  'i',
  'ii',
  'y',
  'w',
])

function normalizeCell(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r?\n|\r/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function parseCsv(text, delimiter = ';') {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === delimiter && !inQuotes) {
      row.push(cell)
      cell = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1
      }
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }

    cell += char
  }

  if (cell || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows.filter((candidate) => candidate.some((value) => normalizeCell(value)))
}

function rowToRecord(headers, row) {
  return Object.fromEntries(headers.map((header, index) => [header, normalizeCell(row[index])]))
}

function isNumericValue(value) {
  return /^\d+(?:[.,]\d+)?$/.test(String(value || '').trim())
}

function getOptionCount(options) {
  return options.length
}

function detectSuspiciousText(text) {
  const normalized = normalizeCell(text)
  const findings = []
  const lower = normalized.toLowerCase()

  if (!normalized) return findings
  if (/\s{2,}/.test(text)) findings.push('repeated spacing')
  if (/\b(rols|tion|cont|ure)\b/i.test(normalized)) findings.push('broken fragment')
  if (/\b(?:rols|tion|cont|ure)[.!?;:,)]?$/i.test(normalized)) findings.push('ends with truncated fragment')
  if (/\b[A-Za-z]{2,}\s+[a-z]\s+[A-Za-z]{2,}\b/.test(normalized)) findings.push('single-letter split inside likely word')
  if (/\b(answer|condition|system|switch|valve|display)\s+s\b/i.test(normalized)) findings.push('split plural suffix')
  if (/\b(A|B|C|D)\s*[:.)-]\s+.*\b(A|B|C|D)\s*[:.)-]/.test(normalized)) findings.push('possible joined options')

  const isShortAllowed = SHORT_ANSWER_WHITELIST.has(lower) || isNumericValue(normalized) || /^[0-9]+ ?(?:ft|feet|kt|kts|knots|°|deg|nm|kg|lb|lbs|psi|v)?$/i.test(normalized)
  if (normalized.length <= 3 && !isShortAllowed) findings.push('very short non-whitelisted text')

  return findings
}

export function validateQuestionBank(questions) {
  const validQuestions = []
  const invalidQuestions = []
  const suspiciousQuestions = []
  const warnings = []

  questions.forEach((question) => {
    const rowIssues = []
    const rowWarnings = []
    const id = Number(question.id)
    const options = Array.isArray(question.options) ? question.options : []
    const correctIndex = ANSWER_KEYS.indexOf(question.correct)

    if (!Number.isInteger(id)) rowIssues.push('ID is missing or not numeric')
    if (!question.question) rowIssues.push('Question is empty')
    if (!options[0]?.text || !options[1]?.text) rowIssues.push('AnswerOne and AnswerTwo are required')
    if (![2, 3, 4].includes(options.length)) rowIssues.push('answer count is not 2, 3, or 4')
    if (correctIndex < 0) rowIssues.push('Correct is not 1, 2, 3, or 4')
    if (correctIndex >= options.length || !options[correctIndex]?.text) rowIssues.push('Correct points to an empty option')
    if (!question.topic || question.topic === 'Uncategorized') rowWarnings.push('topic is empty; assigned Uncategorized')

    const suspiciousFindings = [
      ...detectSuspiciousText(question.question).map((finding) => `question: ${finding}`),
      ...options.flatMap((option) => detectSuspiciousText(option.text).map((finding) => `${option.key}: ${finding}`)),
    ]

    if (rowIssues.length > 0) {
      invalidQuestions.push({ id: question.id, question, issues: rowIssues })
      return
    }

    validQuestions.push(question)

    if (rowWarnings.length > 0) {
      warnings.push({ id: question.id, warnings: rowWarnings })
    }

    if (suspiciousFindings.length > 0) {
      suspiciousQuestions.push({ id: question.id, findings: suspiciousFindings, question })
    }
  })

  return {
    validQuestions,
    invalidQuestions,
    suspiciousQuestions,
    warnings,
  }
}

function buildQuestion(record) {
  const rawOptions = ANSWER_COLUMNS.map((column, index) => ({
    key: ANSWER_KEYS[index],
    text: normalizeCell(record[column]),
  }))
  const options = rawOptions.filter((option) => option.text)
  const correctNumber = Number(normalizeCell(record.Correct))
  const correct = ANSWER_KEYS[correctNumber - 1] || ''
  const rawTopic = normalizeCell(record.Argument)

  return {
    id: Number(normalizeCell(record.ID)),
    topic: rawTopic || 'Uncategorized',
    question: normalizeCell(record.Question),
    options,
    correct,
  }
}

async function main() {
  const csvText = await fs.readFile(inputPath, 'utf8')
  const rows = parseCsv(csvText)
  const headers = rows[0].map(normalizeCell)
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header))

  if (missingHeaders.length > 0) {
    throw new Error(`Missing CSV headers: ${missingHeaders.join(', ')}`)
  }

  const records = rows.slice(1).map((row) => rowToRecord(headers, row))
  const questions = records.map(buildQuestion)
  const validation = validateQuestionBank(questions)
  const generatedQuestions = validation.validQuestions
  const answerCountSummary = generatedQuestions.reduce((summary, question) => {
    const count = getOptionCount(question.options)
    return {
      ...summary,
      [count]: (summary[count] || 0) + 1,
    }
  }, {})
  const missingTopicIds = validation.warnings
    .filter((warning) => warning.warnings.some((message) => message.includes('topic is empty')))
    .map((warning) => warning.id)

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(generatedQuestions, null, 2)}\n`)

  console.log('Question bank build report')
  console.log('--------------------------')
  console.log(`source: ${path.relative(repoRoot, inputPath)}`)
  console.log(`output: ${path.relative(repoRoot, outputPath)}`)
  console.log(`total imported rows: ${records.length}`)
  console.log(`total generated questions: ${generatedQuestions.length}`)
  console.log(`total valid questions: ${validation.validQuestions.length}`)
  console.log(`total invalid questions: ${validation.invalidQuestions.length}`)
  console.log(`total suspicious questions: ${validation.suspiciousQuestions.length}`)
  console.log(`2-option questions: ${answerCountSummary[2] || 0}`)
  console.log(`3-option questions: ${answerCountSummary[3] || 0}`)
  console.log(`4-option questions: ${answerCountSummary[4] || 0}`)
  console.log(`invalid IDs: ${validation.invalidQuestions.map((item) => item.id).join(', ') || 'none'}`)
  console.log(`suspicious IDs: ${validation.suspiciousQuestions.map((item) => item.id).slice(0, 40).join(', ') || 'none'}${validation.suspiciousQuestions.length > 40 ? ' ...' : ''}`)
  console.log(`missing-topic IDs: ${missingTopicIds.join(', ') || 'none'}`)

  if (validation.invalidQuestions.length > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
