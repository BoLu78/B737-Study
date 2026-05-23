import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/* global process */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const questionJsonPath = path.join(repoRoot, 'data/generated/questions.json')
const ANSWER_KEYS = ['A', 'B', 'C', 'D']
const TARGET_QUESTION_ID = 450
const SOURCE_442_ID = 442
const TARGET_QUESTION_TEXT = 'Alternate fuel must be sufficient for:'
const EXPECTED_450 = {
  A: 'Full missed approach procedure from DH, DA, MDA, MDH at destination aerodrome to missed approach altitude; climb from missed approach altitude to cruising level/altitude; descent from TOD to the point where the approach is initiate',
  B: 'Climb from missed approach altitude to cruising level/altitude; cruise from TOC to TOD; descent from TOD to the point where the approach is initiate',
  C: 'Full missed approach procedure from DH, DA, MDA, MDH at destination aerodrome to missed approach altitude; climb from missed approach altitude to cruising level/altitude; cruise from TOC to TOD; descent from TOD to the point where the approach is initiate',
  D: 'Full missed approach procedure from DH, DA, MDA, MDH at destination aerodrome to missed approach altitude; climb from missed approach altitude to cruising level/altitude; cruise from TOC to TOD',
}

function normalizeCell(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r?\n|\r/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function normalizeForComparison(value) {
  return normalizeCell(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function getOption(question, key) {
  return question.options?.find((option) => option.key === key)
}

function addFinding(findings, severity, message) {
  findings.push({ severity, message })
}

async function loadQuestions() {
  const fileText = await fs.readFile(questionJsonPath, 'utf8')
  return JSON.parse(fileText)
}

function auditQuestionShape(questions) {
  const findings = []
  const ids = new Map()

  questions.forEach((question, index) => {
    const id = Number(question.id)
    const options = Array.isArray(question.options) ? question.options : []
    const correct = normalizeCell(question.correct).toUpperCase()
    const optionKeys = new Set(options.map((option) => option.key))
    const normalizedAnswers = options.map((option) => normalizeForComparison(option.text)).filter(Boolean)
    const uniqueNormalizedAnswers = new Set(normalizedAnswers)

    if (!Number.isInteger(id)) {
      addFinding(findings, 'error', `Question at index ${index} has a missing or invalid ID.`)
    } else {
      ids.set(id, [...(ids.get(id) || []), question])
    }

    if (!normalizeCell(question.question)) {
      addFinding(findings, 'error', `Question ${question.id ?? `index ${index}`} has empty question text.`)
    }

    if (options.length < 2) {
      addFinding(findings, 'error', `Question ${question.id ?? `index ${index}`} has fewer than two non-empty answers.`)
    }

    if (!ANSWER_KEYS.includes(correct)) {
      addFinding(findings, 'error', `Question ${question.id ?? `index ${index}`} has invalid correct answer "${question.correct ?? ''}".`)
    } else if (!optionKeys.has(correct)) {
      addFinding(findings, 'error', `Question ${question.id ?? `index ${index}`} correct answer ${correct} points to a missing option.`)
    }

    options.forEach((option) => {
      if (!normalizeCell(option.text)) {
        addFinding(findings, 'error', `Question ${question.id ?? `index ${index}`} option ${option.key ?? '?'} has empty answer text.`)
      }
    })

    if (normalizedAnswers.length > 1 && uniqueNormalizedAnswers.size === 1) {
      addFinding(findings, 'warning', `Question ${question.id ?? `index ${index}`} has all answers identical after normalization.`)
    } else if (normalizedAnswers.length > uniqueNormalizedAnswers.size) {
      addFinding(findings, 'warning', `Question ${question.id ?? `index ${index}`} has two or more identical answers after normalization.`)
    }
  })

  ids.forEach((rows, id) => {
    if (rows.length > 1) {
      addFinding(findings, 'error', `Duplicate generated question ID ${id} appears ${rows.length} times.`)
    }
  })

  const sortedIds = Array.from(ids.keys()).sort((first, second) => first - second)
  for (let index = 1; index < sortedIds.length; index += 1) {
    const previous = sortedIds[index - 1]
    const current = sortedIds[index]
    if (current - previous > 1) {
      addFinding(findings, 'warning', `Generated question IDs skip from ${previous} to ${current}.`)
    }
  }

  return findings
}

function auditQuestion450(questions) {
  const findings = []
  const q450Matches = questions.filter((question) => question.id === TARGET_QUESTION_ID)
  const alternateFuelMatches = questions.filter((question) => normalizeCell(question.question) === TARGET_QUESTION_TEXT)
  const q442 = questions.find((question) => question.id === SOURCE_442_ID)
  const q450 = q450Matches[0]

  if (q450Matches.length !== 1) {
    addFinding(findings, 'error', `Expected exactly one generated question with ID ${TARGET_QUESTION_ID}; found ${q450Matches.length}.`)
  }

  if (alternateFuelMatches.length !== 1) {
    addFinding(findings, 'error', `Expected exactly one "${TARGET_QUESTION_TEXT}" question; found ${alternateFuelMatches.length}.`)
  }

  if (q442 && normalizeCell(q442.question) === TARGET_QUESTION_TEXT) {
    addFinding(findings, 'error', `Question ID ${SOURCE_442_ID} is incorrectly using the alternate fuel question text.`)
  }

  if (!q450) return findings

  if (normalizeCell(q450.question) !== TARGET_QUESTION_TEXT) {
    addFinding(findings, 'error', `Question ${TARGET_QUESTION_ID} text is not "${TARGET_QUESTION_TEXT}".`)
  }

  if (normalizeCell(q450.correct).toUpperCase() !== 'C') {
    addFinding(findings, 'error', `Question ${TARGET_QUESTION_ID} correct answer is ${q450.correct}; expected C.`)
  }

  const optionTexts = ANSWER_KEYS.map((key) => normalizeCell(getOption(q450, key)?.text))
  if (new Set(optionTexts.map(normalizeForComparison)).size === 1) {
    addFinding(findings, 'error', `Question ${TARGET_QUESTION_ID} answers are all identical.`)
  }

  ANSWER_KEYS.forEach((key) => {
    const actualText = normalizeCell(getOption(q450, key)?.text)
    if (actualText !== EXPECTED_450[key]) {
      addFinding(findings, 'error', `Question ${TARGET_QUESTION_ID} option ${key} does not match the expected override text.`)
    }
  })

  return findings
}

function summarize(findings, severity) {
  return findings.filter((finding) => finding.severity === severity)
}

async function main() {
  const questions = await loadQuestions()
  const findings = [
    ...auditQuestionShape(questions),
    ...auditQuestion450(questions),
  ]
  const errors = summarize(findings, 'error')
  const warnings = summarize(findings, 'warning')

  console.log('Question bank audit')
  console.log('-------------------')
  console.log(`source: ${path.relative(repoRoot, questionJsonPath)}`)
  console.log(`total questions: ${questions.length}`)
  console.log(`errors: ${errors.length}`)
  console.log(`warnings: ${warnings.length}`)

  if (errors.length > 0) {
    console.log('')
    console.log('Errors')
    errors.slice(0, 50).forEach((finding) => console.log(`- ${finding.message}`))
  }

  if (warnings.length > 0) {
    console.log('')
    console.log('Warnings')
    warnings.slice(0, 50).forEach((finding) => console.log(`- ${finding.message}`))
    if (warnings.length > 50) console.log(`- ... ${warnings.length - 50} more warnings`)
  }

  if (errors.length > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
