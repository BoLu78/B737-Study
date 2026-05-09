import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanQuizText } from '../src/utils/questionTextCleaner.js'

/* global process */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const reportPath = path.join(repoRoot, 'data/generated/question_text_audit_v8.2.md')
const questionJsonPath = path.join(repoRoot, 'data/generated/questions.json')

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

function auditQuestions(questions) {
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
  }
}

function renderReport({ questions, source, audit }) {
  const topRecurringPatterns = Array.from(audit.recurringPatterns.entries())
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, 25)
  const lines = [
    '# Question Text Audit v8.2',
    '',
    '## Summary',
    '',
    `- Source: ${source}`,
    `- Total questions scanned: ${questions.length}`,
    `- Suspicious question count: ${audit.suspiciousCount}`,
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

  lines.push('## Recommendation')
  lines.push('')
  lines.push('Review recurring patterns, add precise dictionary words or phrase corrections only when the joined result is unambiguous, and keep corrections display-only unless source data is intentionally migrated later.')
  lines.push('')

  return `${lines.join('\n')}\n`
}

async function main() {
  const questionSource = await loadQuestions()
  const audit = auditQuestions(questionSource.questions)
  const report = renderReport({
    questions: questionSource.questions,
    source: questionSource.source,
    audit,
  })

  await fs.mkdir(path.dirname(reportPath), { recursive: true })
  await fs.writeFile(reportPath, report)

  console.log(`Scanned ${questionSource.questions.length} questions from ${questionSource.source}.`)
  console.log(`Suspicious questions: ${audit.suspiciousCount}.`)
  console.log(`Wrote ${path.relative(repoRoot, reportPath)}.`)
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
