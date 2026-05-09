import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  FINAL_TEST_SCOPES,
  getEligibleFinalTestQuestions,
  selectFinalTestQuestions,
} from '../src/utils/finalTestSelection.js'
import { getCanonicalTopic } from '../src/utils/topicNormalizer.js'

/* global process */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const localQuestionsPath = path.join(repoRoot, 'data/generated/t73_r01_questions.json')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function getQuestionKey(question) {
  return String(question.source_id ?? question.sourceId ?? question.id ?? '')
}

function hasDuplicates(questions) {
  const keys = questions.map(getQuestionKey)
  return new Set(keys).size !== keys.length
}

function matchesOriginalFirstSet(originalQuestions, selectedQuestions) {
  const originalFirstKeys = originalQuestions.slice(0, selectedQuestions.length).map(getQuestionKey)
  const selectedKeys = selectedQuestions.map(getQuestionKey)
  return selectedKeys.every((key, index) => key === originalFirstKeys[index])
}

async function loadLocalQuestions() {
  try {
    const fileText = await fs.readFile(localQuestionsPath, 'utf8')
    const rows = JSON.parse(fileText)

    return rows.map((row) => ({
      ...row,
      id: row.source_id,
      sourceId: row.source_id,
      topic: getCanonicalTopic(row.topic),
      status: row.status || 'active',
    }))
  } catch {
    throw new Error(`Local generated question JSON not found at ${path.relative(repoRoot, localQuestionsPath)}.`)
  }
}

function assertSelection({ label, originalQuestions, selectedQuestions, requestedCount }) {
  assert(selectedQuestions.length <= requestedCount, `${label}: selected more than requested.`)
  assert(selectedQuestions.length > 0, `${label}: selected no questions.`)
  assert(!hasDuplicates(selectedQuestions), `${label}: selected duplicate question IDs.`)
  assert(!matchesOriginalFirstSet(originalQuestions, selectedQuestions), `${label}: selection matched the first questions in original order.`)
}

async function main() {
  const questions = await loadLocalQuestions()
  const requestedCount = 100

  const allQuestionsSelection = selectFinalTestQuestions({
    questions,
    scope: FINAL_TEST_SCOPES.ALL,
    requestedCount,
  })
  const aircraftSystemsEligible = getEligibleFinalTestQuestions(questions, FINAL_TEST_SCOPES.AIRCRAFT_SYSTEMS)
  const aircraftSystemsSelection = selectFinalTestQuestions({
    questions,
    scope: FINAL_TEST_SCOPES.AIRCRAFT_SYSTEMS,
    requestedCount,
  })

  assertSelection({
    label: 'All Questions',
    originalQuestions: questions,
    selectedQuestions: allQuestionsSelection,
    requestedCount,
  })
  assertSelection({
    label: 'Aircraft Systems',
    originalQuestions: aircraftSystemsEligible,
    selectedQuestions: aircraftSystemsSelection,
    requestedCount,
  })

  console.log(`Loaded ${questions.length} local questions.`)
  console.log(`All Questions selection: ${allQuestionsSelection.length} questions, no duplicates.`)
  console.log(`Aircraft Systems eligible: ${aircraftSystemsEligible.length} questions.`)
  console.log(`Aircraft Systems selection: ${aircraftSystemsSelection.length} questions, no duplicates.`)
  console.log('Final test selection checks passed.')
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
