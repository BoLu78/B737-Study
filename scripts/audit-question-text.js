import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import xlsx from 'xlsx'
import { cleanQuizText } from '../src/utils/questionTextCleaner.js'

/* global process */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const reportPath = path.join(repoRoot, 'data/generated/question_text_audit_v8.15.md')
const questionJsonPath = path.join(repoRoot, 'data/generated/questions.json')
const questionSourcePath = path.join(repoRoot, 'data/import/T73 R01 TEST 737_R01..xlsx')
const ANSWER_KEYS = ['A', 'B', 'C', 'D']
const SHEET_NAME = 'Table 1'

const PATTERNS = [
  {
    name: 'Known split-word artifacts',
    regex: /\b(?:th e|ri g ht|d isplayed|shutof f|Displa y|displa y|condition s|answer s|system s|switch es|valve s|display s)\b/gi,
  },
  {
    name: 'Suspicious phrase: sid if',
    regex: /\bsid if\b/gi,
  },
  {
    name: 'Isolated plural s',
    regex: /\b[A-Za-z]{3,}\s+s\b/g,
  },
  {
    name: 'Split single letter inside likely word',
    regex: /\b[A-Za-z]{1,}\s+[b-hj-z]\s+[A-Za-z]{1,}\b/g,
  },
  {
    name: 'Leading single-letter split',
    regex: /\b[b-hj-z]\s+[A-Za-z]{4,}\b/g,
  },
  {
    name: 'Trailing single-letter split',
    regex: /\b[A-Za-z]{3,}\s+[b-hj-z]\b/g,
  },
  {
    name: 'Repeated spaces',
    regex: / {2,}/g,
  },
  {
    name: 'Spaces before punctuation',
    regex: /\s+[,.?:;]/g,
  },
]

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

async function loadSourceRows() {
  try {
    await fs.access(questionSourcePath)
    const workbook = xlsx.readFile(questionSourcePath)
    const sheet = workbook.Sheets[SHEET_NAME]
    if (!sheet) throw new Error(`Missing Excel sheet: ${SHEET_NAME}`)
    const rows = xlsx.utils
      .sheet_to_json(sheet, { header: 1, defval: '', blankrows: false, raw: false })
      .filter((candidate) => candidate.some((value) => normalizeCell(value)))
    const headers = rows[0].map(normalizeCell)
    return {
      records: rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, normalizeCell(row[index])]))),
      source: path.relative(repoRoot, questionSourcePath),
    }
  } catch {
    return { records: [], source: 'No Excel source available' }
  }
}

function normalizeCell(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r?\n|\r/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function getQuestionId(question) {
  return question.id ?? question.source_id ?? 'unknown'
}

function getQuestionTexts(question) {
  return [
    ['question', question.question],
    ['answer_a', question.answer_a ?? question.answers?.[0]],
    ['answer_b', question.answer_b ?? question.answers?.[1]],
    ['answer_c', question.answer_c ?? question.answers?.[2]],
    ['answer_d', question.answer_d ?? question.answers?.[3]],
    ['option_a', question.options?.find((option) => option.key === 'A')?.text],
    ['option_b', question.options?.find((option) => option.key === 'B')?.text],
    ['option_c', question.options?.find((option) => option.key === 'C')?.text],
    ['option_d', question.options?.find((option) => option.key === 'D')?.text],
  ].filter(([, value]) => value !== null && value !== undefined && String(value).trim())
}

function incrementCount(map, key) {
  map.set(key, (map.get(key) || 0) + 1)
}

function getOptionTexts(question) {
  const optionMap = new Map((question.options || []).map((option) => [option.key, option.text]))

  return ANSWER_KEYS.map((key, index) => ({
    key,
    text: normalizeCell(optionMap.get(key) ?? question.answers?.[index] ?? question[`answer_${key.toLowerCase()}`]),
  })).filter((option) => option.text)
}

function normalizeAnswerForComparison(value) {
  return normalizeCell(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function getTokenSimilarity(firstValue, secondValue) {
  const firstTokens = new Set(normalizeAnswerForComparison(firstValue).split(' ').filter(Boolean))
  const secondTokens = new Set(normalizeAnswerForComparison(secondValue).split(' ').filter(Boolean))

  if (firstTokens.size === 0 || secondTokens.size === 0) return 0

  const sharedCount = Array.from(firstTokens).filter((token) => secondTokens.has(token)).length
  const unionCount = new Set([...firstTokens, ...secondTokens]).size

  return sharedCount / unionCount
}

function getCorrectAnswer(question) {
  const correct = question.correct_answer ?? question.correctAnswer ?? question.correct
  const normalized = normalizeCell(correct).toUpperCase()

  if (/^[1-4]$/.test(normalized)) return ANSWER_KEYS[Number(normalized) - 1]
  return normalized
}

function auditAnswerIntegrity(questions) {
  const duplicateOptions = []
  const nearDuplicateOptions = []
  const allIdenticalOptions = []
  const invalidCorrectAnswers = []

  questions.forEach((question) => {
    const options = getOptionTexts(question)
    const normalizedOptions = options.map((option) => ({
      ...option,
      normalizedText: normalizeAnswerForComparison(option.text),
    }))
    const nonEmptyNormalizedOptions = normalizedOptions.filter((option) => option.normalizedText)
    const uniqueOptionTexts = new Set(nonEmptyNormalizedOptions.map((option) => option.normalizedText))
    const correct = getCorrectAnswer(question)

    if (!ANSWER_KEYS.includes(correct) || !options.some((option) => option.key === correct)) {
      invalidCorrectAnswers.push({
        id: getQuestionId(question),
        question: question.question,
        correct: question.correct_answer ?? question.correctAnswer ?? question.correct ?? '',
      })
    }

    if (nonEmptyNormalizedOptions.length > 1 && uniqueOptionTexts.size === 1) {
      allIdenticalOptions.push({
        id: getQuestionId(question),
        question: question.question,
        optionKeys: nonEmptyNormalizedOptions.map((option) => option.key).join(', '),
      })
      return
    }

    for (let firstIndex = 0; firstIndex < nonEmptyNormalizedOptions.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < nonEmptyNormalizedOptions.length; secondIndex += 1) {
        const firstOption = nonEmptyNormalizedOptions[firstIndex]
        const secondOption = nonEmptyNormalizedOptions[secondIndex]

        if (firstOption.normalizedText === secondOption.normalizedText) {
          duplicateOptions.push({
            id: getQuestionId(question),
            question: question.question,
            pair: `${firstOption.key}/${secondOption.key}`,
          })
          continue
        }

        const similarity = getTokenSimilarity(firstOption.text, secondOption.text)
        if (similarity >= 0.92) {
          nearDuplicateOptions.push({
            id: getQuestionId(question),
            question: question.question,
            pair: `${firstOption.key}/${secondOption.key}`,
            similarity,
          })
        }
      }
    }
  })

  return {
    duplicateOptions,
    nearDuplicateOptions,
    allIdenticalOptions,
    invalidCorrectAnswers,
  }
}

function auditSourceIds(questions, sourceRecords) {
  const generatedByQuestion = new Map()
  const sourceDuplicateIds = new Map()

  questions.forEach((question) => {
    const normalizedQuestion = normalizeAnswerForComparison(question.question)
    const current = generatedByQuestion.get(normalizedQuestion) || []
    current.push(question)
    generatedByQuestion.set(normalizedQuestion, current)
  })

  sourceRecords.forEach((record) => {
    const id = normalizeCell(record.ID)
    const current = sourceDuplicateIds.get(id) || []
    current.push(record)
    sourceDuplicateIds.set(id, current)
  })

  const sourceIdMismatches = sourceRecords.flatMap((record) => {
    const matchingGeneratedQuestions = generatedByQuestion.get(normalizeAnswerForComparison(record.Question)) || []
    return matchingGeneratedQuestions
      .filter((question) => String(getQuestionId(question)) !== normalizeCell(record.ID))
      .map((question) => ({
        sourceId: normalizeCell(record.ID),
        generatedId: getQuestionId(question),
        question: question.question,
      }))
  })
  const duplicateSourceIds = Array.from(sourceDuplicateIds.entries())
    .filter(([id, records]) => id && records.length > 1)
    .map(([id, records]) => ({
      id,
      count: records.length,
      questions: records.map((record) => record.Question),
    }))

  return {
    sourceIdMismatches,
    duplicateSourceIds,
  }
}

function auditQuestions(questions, sourceRecords) {
  const examplesByPattern = new Map(PATTERNS.map((pattern) => [pattern.name, []]))
  const recurringPatterns = new Map()
  const suspiciousIds = new Set()

  questions.forEach((question) => {
    getQuestionTexts(question).forEach(([field, value]) => {
      const originalText = String(value)
      const cleanedPreview = cleanQuizText(originalText)

      PATTERNS.forEach((pattern) => {
        pattern.regex.lastIndex = 0
        const matches = Array.from(originalText.matchAll(pattern.regex))

        if (matches.length === 0) return

        suspiciousIds.add(String(getQuestionId(question)))
        matches.forEach((match) => incrementCount(recurringPatterns, match[0]))

        const examples = examplesByPattern.get(pattern.name)

        if (examples.length < 15) {
          examples.push({
            id: getQuestionId(question),
            field,
            originalText,
            cleanedPreview,
          })
        }
      })
    })
  })

  return {
    suspiciousCount: suspiciousIds.size,
    examplesByPattern,
    recurringPatterns,
    answerIntegrity: auditAnswerIntegrity(questions),
    sourceIdIntegrity: auditSourceIds(questions, sourceRecords),
  }
}

function renderReport({ questions, source, audit }) {
  const topRecurringPatterns = Array.from(audit.recurringPatterns.entries())
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, 25)
  const lines = [
    '# Question Text Audit v8.15',
    '',
    '## Summary',
    '',
    `- Source: ${source}`,
    `- Total questions scanned: ${questions.length}`,
    `- Suspicious question count: ${audit.suspiciousCount}`,
    `- Duplicate answer option groups: ${audit.answerIntegrity.duplicateOptions.length}`,
    `- Near-duplicate answer option groups: ${audit.answerIntegrity.nearDuplicateOptions.length}`,
    `- Questions where all options are identical: ${audit.answerIntegrity.allIdenticalOptions.length}`,
    `- Missing or invalid correct answers: ${audit.answerIntegrity.invalidCorrectAnswers.length}`,
    `- Source ID mismatches: ${audit.sourceIdIntegrity.sourceIdMismatches.length}`,
    `- Duplicate source IDs: ${audit.sourceIdIntegrity.duplicateSourceIds.length}`,
    '',
    '## Top Recurring Suspicious Patterns',
    '',
  ]

  if (topRecurringPatterns.length === 0) {
    lines.push('No recurring suspicious patterns found.', '')
  } else {
    topRecurringPatterns.forEach(([pattern, count]) => {
      lines.push(`- \`${pattern}\`: ${count}`)
    })
    lines.push('')
  }

  lines.push('## Examples By Pattern', '')

  audit.examplesByPattern.forEach((examples, patternName) => {
    lines.push(`### ${patternName}`, '')

    if (examples.length === 0) {
      lines.push('No examples found.', '')
      return
    }

    examples.forEach((example) => {
      lines.push(`- Question ID: ${example.id}`)
      lines.push(`  - Field: ${example.field}`)
      lines.push(`  - Original: ${example.originalText}`)
      lines.push(`  - Cleaned preview: ${example.cleanedPreview}`)
    })

    lines.push('')
  })

  lines.push('## Answer Integrity', '')

  if (
    audit.answerIntegrity.duplicateOptions.length === 0 &&
    audit.answerIntegrity.nearDuplicateOptions.length === 0 &&
    audit.answerIntegrity.allIdenticalOptions.length === 0 &&
    audit.answerIntegrity.invalidCorrectAnswers.length === 0
  ) {
    lines.push('No answer integrity issues found.', '')
  } else {
    const answerSections = [
      ['All Options Identical', audit.answerIntegrity.allIdenticalOptions],
      ['Duplicate Options', audit.answerIntegrity.duplicateOptions],
      ['Near-Duplicate Options', audit.answerIntegrity.nearDuplicateOptions],
      ['Invalid Correct Answers', audit.answerIntegrity.invalidCorrectAnswers],
    ]

    answerSections.forEach(([heading, rows]) => {
      lines.push(`### ${heading}`, '')
      if (rows.length === 0) {
        lines.push('No examples found.', '')
        return
      }

      rows.slice(0, 25).forEach((row) => {
        lines.push(`- Question ID: ${row.id}`)
        lines.push(`  - Question: ${row.question || '—'}`)
        if (row.pair) lines.push(`  - Options: ${row.pair}`)
        if (row.optionKeys) lines.push(`  - Options: ${row.optionKeys}`)
        if (row.similarity) lines.push(`  - Similarity: ${row.similarity.toFixed(2)}`)
        if (row.correct !== undefined) lines.push(`  - Correct answer: ${row.correct || '—'}`)
      })
      lines.push('')
    })
  }

  lines.push('## Source ID Integrity', '')

  if (audit.sourceIdIntegrity.sourceIdMismatches.length === 0 && audit.sourceIdIntegrity.duplicateSourceIds.length === 0) {
    lines.push('No source ID integrity issues found.', '')
  } else {
    lines.push('### Source ID Mismatches', '')
    if (audit.sourceIdIntegrity.sourceIdMismatches.length === 0) {
      lines.push('No examples found.', '')
    } else {
      audit.sourceIdIntegrity.sourceIdMismatches.slice(0, 25).forEach((row) => {
        lines.push(`- Source ID: ${row.sourceId} | Generated ID: ${row.generatedId}`)
        lines.push(`  - Question: ${row.question || '—'}`)
      })
      lines.push('')
    }

    lines.push('### Duplicate Source IDs', '')
    if (audit.sourceIdIntegrity.duplicateSourceIds.length === 0) {
      lines.push('No examples found.', '')
    } else {
      audit.sourceIdIntegrity.duplicateSourceIds.slice(0, 25).forEach((row) => {
        lines.push(`- Source ID: ${row.id} (${row.count} rows)`)
        row.questions.slice(0, 3).forEach((question) => {
          lines.push(`  - Question: ${question || '—'}`)
        })
      })
      lines.push('')
    }
  }

  lines.push('## Recommendation')
  lines.push('')
  lines.push('Review recurring text patterns and answer/source integrity findings. Keep broad cleanup display-only unless source data is intentionally migrated later.')
  lines.push('')

  return `${lines.join('\n')}\n`
}

async function main() {
  const questionSource = await loadQuestions()
  const excelSource = await loadSourceRows()
  const audit = auditQuestions(questionSource.questions, excelSource.records)
  const report = renderReport({
    questions: questionSource.questions,
    source: `${questionSource.source}; ${excelSource.source}`,
    audit,
  })

  await fs.mkdir(path.dirname(reportPath), { recursive: true })
  await fs.writeFile(reportPath, report)

  console.log(`Scanned ${questionSource.questions.length} questions from ${questionSource.source}.`)
  console.log(`Suspicious questions: ${audit.suspiciousCount}.`)
  console.log(`Duplicate answer option groups: ${audit.answerIntegrity.duplicateOptions.length}.`)
  console.log(`Near-duplicate answer option groups: ${audit.answerIntegrity.nearDuplicateOptions.length}.`)
  console.log(`All-identical answer option questions: ${audit.answerIntegrity.allIdenticalOptions.length}.`)
  console.log(`Missing or invalid correct answers: ${audit.answerIntegrity.invalidCorrectAnswers.length}.`)
  console.log(`Source ID mismatches: ${audit.sourceIdIntegrity.sourceIdMismatches.length}.`)
  console.log(`Wrote ${path.relative(repoRoot, reportPath)}.`)
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
