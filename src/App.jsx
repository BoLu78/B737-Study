import { useState, useEffect } from 'react'
import './App.css'
import generatedQuestionBank from '../data/generated/questions.json'
import { MEMORY_ITEMS } from './data/memoryItems'
import {
  countManualChunks,
  createSignedManualUrl,
  getCurrentSession,
  loadManualChunksSearch,
  loadManualDocuments,
  onAuthStateChange,
  signInWithEmailPassword,
  signOut,
} from './lib/supabaseClient'
import { cleanAnswerText, cleanQuestionText } from './utils/questionTextCleaner'
import {
  FINAL_TEST_COUNT_OPTIONS,
  FINAL_TEST_SCOPES,
  FINAL_TEST_SCOPE_LABELS,
  getEligibleFinalTestQuestions,
  selectFinalTestQuestions,
  shuffleArray,
} from './utils/finalTestSelection'
import { getCanonicalTopic } from './utils/topicNormalizer'

const APP_VERSION = 'v8.12'
const STUDY_PROGRESS_STORAGE_KEY = 'b737StudyProgress_v8_2'
const TOPIC_STATS_STORAGE_KEY = 'b737StudyTopicStats_v8_2'
const IN_PROGRESS_TOPIC_SESSIONS_STORAGE_KEY = 'b737StudyInProgressTopicSessions_v8_2'
const MARKED_QUESTIONS_STORAGE_KEY = 'b737StudyMarkedQuestions_v8_2'
const MEMORY_ERROR_STATS_STORAGE_KEY = 'b737StudyMemoryErrorStats_v8_5'
const MEMORY_MODES = {
  STUDY: 'study',
  BLIND_RECALL: 'blind-recall',
  ACTION_DRILL: 'action-drill',
  ORDER_DRILL: 'order-drill',
  MIXED_TEST: 'mixed-test',
}
const COMMON_MEMORY_ACTION_OPTIONS = [
  'CUTOFF',
  'OFF',
  'ON',
  'MAN',
  'CONT',
  'FLT',
  'CUTOUT',
  'Disengage',
  'Confirm, close',
  'Confirm, CUTOFF',
  'Confirm, pull',
  'IDLE detent',
  'FLIGHT DETENT',
  '10° and 80% N1',
  '4° and 75% N1',
]
const PLANNED_MANUAL_TYPES = ['FCOM', 'FCTM', 'QRH', 'MEL', 'OM-B', 'CBT / Training Notes', 'T73 Question Bank']
const DATA_SOURCE_GENERATED = 'CSV question bank'
const CORRECT_ANSWER_OPTIONS = ['A', 'B', 'C', 'D']
const ANSWER_KEYS = ['A', 'B', 'C', 'D']
const PLACEHOLDER_ANSWERS = new Set(['not applicable', 'n/a', 'na'])
const STATUS_OPTIONS = ['active', 'draft', 'to_verify', 'obsolete']
const DIFFICULTY_OPTIONS = ['easy', 'normal', 'hard']
const REQUIRED_ADMIN_FIELDS = [
  'topic',
  'question',
  'answer_a',
  'answer_b',
  'answer_c',
  'answer_d',
  'correct_answer',
  'status',
  'difficulty',
]

const EMPTY_ADMIN_FORM = {
  topic: '',
  source_id: '',
  subtopic: '',
  question: '',
  answer_a: '',
  answer_b: '',
  answer_c: '',
  answer_d: '',
  correct_answer: 'A',
  explanation: '',
  manual_reference: '',
  source_document: '',
  status: 'draft',
  difficulty: 'normal',
}

const GENERATED_QUESTIONS = generatedQuestionBank.map((question) => {
  const correctAnswerLetter = String(question.correct || '').trim().toUpperCase()
  const correctAnswerIndex = ANSWER_KEYS.indexOf(correctAnswerLetter)
  const answers = ANSWER_KEYS.map((key) => question.options?.find((option) => option.key === key)?.text || '')

  return {
    id: question.id,
    sourceId: question.id,
    rawTopic: question.topic,
    topic: getCanonicalTopic(question.topic),
    subtopic: null,
    question: question.question,
    answers,
    options: question.options || [],
    correctAnswer: correctAnswerIndex >= 0 ? correctAnswerIndex : 0,
    correctAnswerLetter,
    explanation: '',
    manualReference: null,
    sourceDocument: 'questions.csv',
    sourcePage: null,
    status: 'active',
    difficulty: null,
  }
})

function buildAdminFormFromQuestion(question) {
  return {
    topic: question.topic || '',
    source_id: question.sourceId || '',
    subtopic: question.subtopic || '',
    question: question.question || '',
    answer_a: question.answers?.[0] || '',
    answer_b: question.answers?.[1] || '',
    answer_c: question.answers?.[2] || '',
    answer_d: question.answers?.[3] || '',
    correct_answer: question.correctAnswerLetter || String.fromCharCode(65 + (question.correctAnswer ?? 0)),
    explanation: question.explanation || '',
    manual_reference: question.manualReference || '',
    source_document: question.sourceDocument || '',
    status: question.status || 'draft',
    difficulty: question.difficulty || 'normal',
  }
}

function normalizeAdminForm(form) {
  return {
    topic: form.topic.trim(),
    source_id: form.source_id === '' ? null : Number(form.source_id),
    subtopic: form.subtopic.trim(),
    question: form.question.trim(),
    answer_a: form.answer_a.trim(),
    answer_b: form.answer_b.trim(),
    answer_c: form.answer_c.trim(),
    answer_d: form.answer_d.trim(),
    correct_answer: form.correct_answer,
    explanation: form.explanation.trim(),
    manual_reference: form.manual_reference.trim(),
    source_document: form.source_document.trim(),
    status: form.status,
    difficulty: form.difficulty,
  }
}

function validateAdminForm(form) {
  const missingFields = REQUIRED_ADMIN_FIELDS.filter((field) => !String(form[field] || '').trim())

  if (missingFields.length > 0) {
    return `Required fields missing: ${missingFields.join(', ')}.`
  }

  if (!CORRECT_ANSWER_OPTIONS.includes(form.correct_answer)) {
    return 'Correct answer must be A, B, C, or D.'
  }

  if (!STATUS_OPTIONS.includes(form.status)) {
    return 'Status must be active, draft, to_verify, or obsolete.'
  }

  if (!DIFFICULTY_OPTIONS.includes(form.difficulty)) {
    return 'Difficulty must be easy, normal, or hard.'
  }

  if (form.source_id && !Number.isInteger(Number(form.source_id))) {
    return 'Source question ID must be a whole number.'
  }

  return null
}

function getCorrectAnswerKey(question) {
  const answerLetter = String(question?.correctAnswerLetter || '').trim().toUpperCase()

  if (ANSWER_KEYS.includes(answerLetter)) {
    return answerLetter
  }

  const answerIndex = Number(question?.correctAnswer)
  return Number.isInteger(answerIndex) && ANSWER_KEYS[answerIndex] ? ANSWER_KEYS[answerIndex] : 'A'
}

function isPlaceholderAnswer(answerText) {
  return PLACEHOLDER_ANSWERS.has(answerText.toLowerCase())
}

function normalizeQuizOptions(question) {
  const correctAnswerKey = getCorrectAnswerKey(question)
  if (Array.isArray(question?.options) && question.options.length > 0) {
    return question.options
      .map((option) => {
        const key = String(option.key || '').trim().toUpperCase()
        const originalIndex = ANSWER_KEYS.indexOf(key)
        const text = cleanAnswerText(option.text)

        if (!ANSWER_KEYS.includes(key) || !text || (isPlaceholderAnswer(text) && key !== correctAnswerKey)) {
          return null
        }

        return { key, text, originalIndex }
      })
      .filter(Boolean)
  }

  const answers = Array.isArray(question?.answers) ? question.answers : []

  return ANSWER_KEYS.map((key, originalIndex) => {
    const answer = answers[originalIndex]
    const text = cleanAnswerText(answer)

    if (!text || (isPlaceholderAnswer(text) && key !== correctAnswerKey)) {
      return null
    }

    return { key, text, originalIndex }
  }).filter(Boolean)
}

function displayReferenceValue(value) {
  const text = value === null || value === undefined ? '' : String(value).trim()
  return text || '—'
}

function displayQuestionSourceId(question) {
  return displayReferenceValue(question?.sourceId)
}

function getQuestionStorageKey(question) {
  const sourceDocument = displayReferenceValue(question?.sourceDocument)
  const sourceId = displayReferenceValue(question?.sourceId)

  if (sourceDocument !== '—' && sourceId !== '—') {
    return `${sourceDocument}::${sourceId}`
  }

  return `internal::${displayReferenceValue(question?.id)}`
}

function createQuestionLookup(questions) {
  return new Map(questions.map((question) => [getQuestionStorageKey(question), question]))
}

function buildStoredSessionResults(results) {
  return results.map((result) => ({
    questionKey: getQuestionStorageKey(result.question),
    selectedAnswerIndex: result.selectedAnswerIndex,
    selectedAnswerKey: result.selectedAnswerKey,
    selectedAnswerText: result.selectedAnswerText,
    correctAnswerKey: result.correctAnswerKey,
    correctAnswerText: result.correctAnswerText,
    isCorrect: result.isCorrect,
  }))
}

function hasReferenceMetadata(question) {
  return Boolean(
    displayReferenceValue(question?.manualReference) !== '—' ||
      displayReferenceValue(question?.sourceDocument) !== '—' ||
      displayReferenceValue(question?.sourcePage) !== '—' ||
      displayReferenceValue(question?.sourceId) !== '—',
  )
}

function getUniqueReferenceValues(questions, field) {
  return Array.from(
    new Set(
      questions
        .map((item) => displayReferenceValue(item[field]))
        .filter((value) => value !== '—'),
    ),
  ).sort((first, second) => first.localeCompare(second, undefined, { numeric: true }))
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getManualSearchHighlightTerms(query) {
  const normalizedQuery = String(query || '').replace(/\s+/g, ' ').trim()
  const words = Array.from(
    new Set(
      normalizedQuery
        .toLowerCase()
        .split(/\s+/)
        .map((word) => word.replace(/[^\p{L}\p{N}-]/gu, ''))
        .filter((word) => word.length > 1),
    ),
  )
  const reversedPhrase = words.length === 2 ? `${words[1]} ${words[0]}` : ''

  return Array.from(new Set([normalizedQuery, reversedPhrase, ...words].filter(Boolean)))
    .sort((first, second) => second.length - first.length)
}

function loadStoredTopicStats() {
  if (typeof window === 'undefined') return {}

  try {
    const parsedStats = JSON.parse(window.localStorage.getItem(TOPIC_STATS_STORAGE_KEY) || '{}')
    return parsedStats && typeof parsedStats === 'object' && !Array.isArray(parsedStats) ? parsedStats : {}
  } catch {
    return {}
  }
}

function saveStoredTopicStats(stats) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TOPIC_STATS_STORAGE_KEY, JSON.stringify(stats))
}

function loadStoredInProgressTopicSessions() {
  if (typeof window === 'undefined') return {}

  try {
    return JSON.parse(window.localStorage.getItem(IN_PROGRESS_TOPIC_SESSIONS_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveStoredInProgressTopicSessions(sessions) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(IN_PROGRESS_TOPIC_SESSIONS_STORAGE_KEY, JSON.stringify(sessions))
}

function loadStoredMarkedQuestions() {
  if (typeof window === 'undefined') return {}

  try {
    return JSON.parse(window.localStorage.getItem(MARKED_QUESTIONS_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveStoredMarkedQuestions(markedQuestions) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MARKED_QUESTIONS_STORAGE_KEY, JSON.stringify(markedQuestions))
}

function loadStoredMemoryErrorStats() {
  if (typeof window === 'undefined') return {}

  try {
    const parsedStats = JSON.parse(window.localStorage.getItem(MEMORY_ERROR_STATS_STORAGE_KEY) || '{}')
    return parsedStats && typeof parsedStats === 'object' && !Array.isArray(parsedStats) ? parsedStats : {}
  } catch {
    return {}
  }
}

function saveStoredMemoryErrorStats(stats) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MEMORY_ERROR_STATS_STORAGE_KEY, JSON.stringify(stats))
}

function clearStoredStudyProgress() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STUDY_PROGRESS_STORAGE_KEY)
  window.localStorage.removeItem(TOPIC_STATS_STORAGE_KEY)
  window.localStorage.removeItem(IN_PROGRESS_TOPIC_SESSIONS_STORAGE_KEY)
}

function getTopicStatus(totalAnswered, accuracy) {
  if (!totalAnswered) return 'Not Studied'
  if (accuracy >= 85) return 'Strong'
  if (accuracy >= 70) return 'Good'
  return 'Needs Focus'
}

function createManualChunkExcerpt(text, query) {
  const normalizedText = String(text || '').replace(/\s+/g, ' ').trim()
  const highlightTerms = getManualSearchHighlightTerms(query)

  if (!normalizedText) {
    return '—'
  }

  const normalizedTextLower = normalizedText.toLowerCase()
  const matchIndex = highlightTerms.reduce((bestIndex, term) => {
    const termIndex = normalizedTextLower.indexOf(term.toLowerCase())

    if (termIndex === -1) return bestIndex
    if (bestIndex === -1) return termIndex

    return Math.min(bestIndex, termIndex)
  }, -1)
  const excerptLength = 420
  const start = matchIndex === -1
    ? 0
    : Math.max(matchIndex - 150, 0)
  const end = Math.min(start + excerptLength, normalizedText.length)
  const excerpt = normalizedText.slice(start, end)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < normalizedText.length ? '...' : ''

  if (highlightTerms.length === 0) {
    return `${prefix}${excerpt}${suffix}`
  }

  const highlightPattern = new RegExp(`(${highlightTerms.map(escapeRegExp).join('|')})`, 'gi')
  const parts = excerpt.split(highlightPattern)

  return (
    <>
      {prefix}
      {parts.map((part, index) => (
        highlightTerms.some((term) => term.toLowerCase() === part.toLowerCase())
          ? <mark key={`${part}-${index}`}>{part}</mark>
          : part
      ))}
      {suffix}
    </>
  )
}

function getMemoryItemSearchText(item) {
  const stepTexts = item.steps.flatMap((step) => [
    step.left,
    step.right,
    ...(step.substeps || []).flatMap((substep) => [substep.left, substep.right]),
  ])

  return [
    item.title,
    item.subtitle,
    item.topic,
    item.category,
    ...stepTexts,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function calculateMemoryErrorRate(errors, checks) {
  return checks > 0 ? Math.round((errors / checks) * 100) : 0
}

function getMemoryAssessableLines(item) {
  return item.steps.flatMap((step) => [
    {
      id: `${item.id}-step-${step.number}`,
      left: step.left,
      right: step.right || '',
    },
    ...(step.substeps || []).map((substep, index) => ({
      id: `${item.id}-step-${step.number}-substep-${index}`,
      left: substep.left,
      right: substep.right || '',
    })),
  ])
}

function getMemoryActionLines(item) {
  return getMemoryAssessableLines(item).filter((line) => line.right)
}

function getMemoryRightSideValues() {
  const dataValues = MEMORY_ITEMS.flatMap((item) => getMemoryActionLines(item).map((line) => line.right))
  return Array.from(new Set([...dataValues, ...COMMON_MEMORY_ACTION_OPTIONS].filter(Boolean)))
}

function hashString(value) {
  return String(value).split('').reduce((hash, character) => {
    const nextHash = (hash << 5) - hash + character.charCodeAt(0)
    return nextHash >>> 0
  }, 0)
}

function deterministicShuffle(items, seed) {
  return [...items]
    .map((item) => ({
      item,
      sortKey: hashString(`${seed}-${item.id || item}`),
    }))
    .sort((first, second) => first.sortKey - second.sortKey)
    .map(({ item }) => item)
}

function fisherYatesShuffle(items) {
  const shuffledItems = [...items]

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffledItems[index], shuffledItems[swapIndex]] = [shuffledItems[swapIndex], shuffledItems[index]]
  }

  return shuffledItems
}

function hasSameOrder(firstItems, secondItems) {
  return firstItems.length === secondItems.length && firstItems.every((item, index) => item.id === secondItems[index]?.id)
}

function shuffleMemoryOrderSteps(steps) {
  if (steps.length <= 1) return [...steps]

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const shuffledSteps = fisherYatesShuffle(steps)

    if (!hasSameOrder(shuffledSteps, steps)) {
      return shuffledSteps
    }
  }

  const fallbackSteps = [...steps]
  ;[fallbackSteps[0], fallbackSteps[1]] = [fallbackSteps[1], fallbackSteps[0]]
  return fallbackSteps
}

function getMemoryActionOptions(line) {
  const values = getMemoryRightSideValues().filter((value) => value !== line.right)
  const distractors = deterministicShuffle(values, line.id).slice(0, 3)
  return deterministicShuffle([line.right, ...distractors], `${line.id}-options`).slice(0, 4)
}

function getMemoryOrderSteps(item) {
  return item.steps.map((step) => ({
    id: `${item.id}-order-${step.number}`,
    left: step.left,
    right: step.right || '',
  }))
}

function getMemoryResultFromMarks(lines, marks) {
  const checks = lines.length
  const errors = lines.filter((line) => marks[line.id] === false).length
  return {
    checks,
    errors,
    errorRate: calculateMemoryErrorRate(errors, checks),
  }
}

function getMemoryStatsSummary(items, statsById) {
  const testedItems = items.filter((item) => Number(statsById[item.id]?.totalChecks) > 0)
  const totalChecks = testedItems.reduce((sum, item) => sum + (Number(statsById[item.id]?.totalChecks) || 0), 0)
  const totalErrors = testedItems.reduce((sum, item) => sum + (Number(statsById[item.id]?.totalErrors) || 0), 0)
  const averageErrorRate = calculateMemoryErrorRate(totalErrors, totalChecks)
  const highestErrorItem = testedItems
    .map((item) => ({
      item,
      averageErrorRate: Number(statsById[item.id]?.averageErrorRate) || 0,
    }))
    .sort((first, second) => second.averageErrorRate - first.averageErrorRate)[0] || null

  return {
    testedCount: testedItems.length,
    totalChecks,
    totalErrors,
    averageErrorRate,
    highestErrorItem,
  }
}

function getMemoryStatusText(stats) {
  if (!stats || Number(stats.totalChecks) === 0) return ['Never tested']

  return [
    `Last error: ${Number(stats.lastErrorRate) || 0}%`,
    `Average error: ${Number(stats.averageErrorRate) || 0}%`,
    `Attempts: ${Number(stats.attempts) || 0}`,
  ]
}

function getMemoryErrorSeverity(errorRate) {
  const rate = Number(errorRate) || 0

  if (rate >= 51) return 'high'
  if (rate >= 21) return 'medium'
  return 'low'
}

function getMemoryStatusClass(text) {
  const errorRateMatch = String(text).match(/(\d+)%/)

  if (!errorRateMatch) return 'memory-status-neutral'

  return `memory-error-${getMemoryErrorSeverity(Number(errorRateMatch[1]))}`
}

function formatMemoryActionText(value) {
  const text = String(value || '').trim()
  if (!text) return ''

  return text.charAt(0).toUpperCase() + text.slice(1)
}

function formatMemoryResponse(value) {
  const text = String(value || '').trim()
  const confirmMatch = text.match(/^Confirm,\s*(.+)$/)

  if (!confirmMatch) {
    return <span className="memory-response-action">{text}</span>
  }

  return (
    <>
      <span className="memory-confirm-label">(Confirm)</span>
      <span className="memory-response-action">{formatMemoryActionText(confirmMatch[1])}</span>
    </>
  )
}

function App() {
  const [questions] = useState(GENERATED_QUESTIONS)
  const [isLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [dataSource] = useState(DATA_SOURCE_GENERATED)
  const [view, setView] = useState('dashboard')
  const [selectedTopic, setSelectedTopic] = useState('')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [answered, setAnswered] = useState(false)
  const [correct, setCorrect] = useState(false)
  const [practiceMode, setPracticeMode] = useState('topic')
  const [isReviewingWrongAnswers, setIsReviewingWrongAnswers] = useState(false)
  const [isSessionComplete, setIsSessionComplete] = useState(false)
  const [sessionResults, setSessionResults] = useState([])
  const [randomStudyCount, setRandomStudyCount] = useState(20)
  const [randomStudySessionQuestions, setRandomStudySessionQuestions] = useState([])
  const [finalTestScope, setFinalTestScope] = useState(FINAL_TEST_SCOPES.ALL)
  const [finalTestCount, setFinalTestCount] = useState(100)
  const [finalTestSelectedTopics, setFinalTestSelectedTopics] = useState([])
  const [finalTestSessionQuestions, setFinalTestSessionQuestions] = useState([])
  const [finalTestSessionConfig, setFinalTestSessionConfig] = useState({
    scope: FINAL_TEST_SCOPES.ALL,
    count: 100,
    selectedTopics: [],
  })
  const [topicSessionQuestions, setTopicSessionQuestions] = useState([])
  const [pendingResumeTopic, setPendingResumeTopic] = useState('')
  const [markedQuestions, setMarkedQuestions] = useState(loadStoredMarkedQuestions)
  const [markedReviewQuestions, setMarkedReviewQuestions] = useState([])
  const [topicStats, setTopicStats] = useState(loadStoredTopicStats)
  const [adminForm, setAdminForm] = useState(null)
  const [adminMode, setAdminMode] = useState(null)
  const [adminFormError, setAdminFormError] = useState('')
  const [adminPreview, setAdminPreview] = useState(null)
  const [referenceSourceFilter, setReferenceSourceFilter] = useState('')
  const [referenceTopicFilter, setReferenceTopicFilter] = useState('')
  const [referenceSearch, setReferenceSearch] = useState('')
  const [memoryMode, setMemoryMode] = useState(MEMORY_MODES.STUDY)
  const [memoryTopicFilter, setMemoryTopicFilter] = useState('')
  const [memoryCategoryFilter, setMemoryCategoryFilter] = useState('')
  const [memorySearch, setMemorySearch] = useState('')
  const [memoryRevealedItems, setMemoryRevealedItems] = useState({})
  const [memoryBlindMarks, setMemoryBlindMarks] = useState({})
  const [memoryActionSelections, setMemoryActionSelections] = useState({})
  const [memoryOrderSelections, setMemoryOrderSelections] = useState({})
  const [memoryOrderShuffles, setMemoryOrderShuffles] = useState({})
  const [memoryOrderReveals, setMemoryOrderReveals] = useState({})
  const [memorySavedResults, setMemorySavedResults] = useState({})
  const [memoryErrorStats, setMemoryErrorStats] = useState(loadStoredMemoryErrorStats)
  const [mixedSession, setMixedSession] = useState(null)
  const [manualDocuments, setManualDocuments] = useState([])
  const [isManualCatalogLoading, setIsManualCatalogLoading] = useState(true)
  const [manualSession, setManualSession] = useState(null)
  const [manualAuthEmail, setManualAuthEmail] = useState('')
  const [manualAuthPassword, setManualAuthPassword] = useState('')
  const [manualAuthError, setManualAuthError] = useState('')
  const [manualOpenError, setManualOpenError] = useState('')
  const [openingManualId, setOpeningManualId] = useState(null)
  const [manualCardErrors, setManualCardErrors] = useState({})
  const [fallbackManualLink, setFallbackManualLink] = useState(null)
  const [manualSearchQuery, setManualSearchQuery] = useState('')
  const [manualSearchManualType, setManualSearchManualType] = useState('')
  const [manualSearchAircraft, setManualSearchAircraft] = useState('')
  const [manualSearchResults, setManualSearchResults] = useState([])
  const [manualSearchError, setManualSearchError] = useState('')
  const [isManualSearchLoading, setIsManualSearchLoading] = useState(false)
  const [hasManualChunks, setHasManualChunks] = useState(false)
  const [manualChunksCount, setManualChunksCount] = useState(null)
  const [hasManualSearchRun, setHasManualSearchRun] = useState(false)

  useEffect(() => {
    let isMounted = true

    const loadInitialData = async () => {
      const manualResult = await loadManualDocuments()

      if (isMounted) {
        setManualDocuments(manualResult.data || [])
        setIsManualCatalogLoading(false)
        if (GENERATED_QUESTIONS.length === 0) {
          setLoadError('Generated question bank is empty. Run npm run build:questions.')
        }
      }
    }

    loadInitialData()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadSession = async () => {
      const { data } = await getCurrentSession()

      if (isMounted) {
        setManualSession(data)
      }
    }

    loadSession()

    const subscription = onAuthStateChange((session) => {
      if (isMounted) {
        setManualSession(session)
        setManualAuthError('')
        setManualOpenError('')
        setManualCardErrors({})
        setFallbackManualLink(null)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!fallbackManualLink) return undefined

    const timeoutId = window.setTimeout(() => {
      setFallbackManualLink(null)
    }, 300000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [fallbackManualLink])

  useEffect(() => {
    let isMounted = true

    const checkManualChunks = async () => {
      const [sampleResult, countResult] = await Promise.all([
        loadManualChunksSearch({ limit: 1 }),
        countManualChunks(),
      ])

      if (isMounted) {
        const hasSampleChunk = Boolean(!sampleResult.error && sampleResult.data?.length)
        const hasCountedChunks = Number.isInteger(countResult.count) && countResult.count > 0

        setHasManualChunks(hasSampleChunk || hasCountedChunks)

        if (!countResult.error && Number.isInteger(countResult.count)) {
          setManualChunksCount(countResult.count)
        }
      }
    }

    checkManualChunks()

    return () => {
      isMounted = false
    }
  }, [])

  const topics = Array.from(new Set(questions.map((item) => item.topic)))
  const questionLookup = createQuestionLookup(questions)
  const currentTopic = topics.includes(selectedTopic) ? selectedTopic : topics[0] || ''
  const finalTestEligibleQuestions = getEligibleFinalTestQuestions(questions, finalTestScope, finalTestSelectedTopics)
  const finalTestAvailableCount = finalTestEligibleQuestions.length
  const finalTestPlannedCount = Math.min(finalTestCount, finalTestAvailableCount)
  const finalTestScopeLabel = FINAL_TEST_SCOPE_LABELS[finalTestScope] || FINAL_TEST_SCOPE_LABELS[FINAL_TEST_SCOPES.ALL]
  const activeFinalTestScopeLabel =
    FINAL_TEST_SCOPE_LABELS[finalTestSessionConfig.scope] || FINAL_TEST_SCOPE_LABELS[FINAL_TEST_SCOPES.ALL]
  const wrongResults = sessionResults.filter((result) => !result.isCorrect)
  const activeQuizQuestions = isReviewingWrongAnswers
    ? wrongResults.map((result) => result.question)
    : practiceMode === 'final'
      ? finalTestSessionQuestions
      : practiceMode === 'marked'
        ? markedReviewQuestions
        : practiceMode === 'random-study'
          ? randomStudySessionQuestions
          : topicSessionQuestions
  const activeQuizTitle = isReviewingWrongAnswers
    ? 'Wrong Answer Review'
    : practiceMode === 'final'
      ? 'Final Test Simulation'
      : practiceMode === 'marked'
        ? 'Marked Question Review'
        : practiceMode === 'random-study'
          ? 'Random Study'
          : currentTopic
  const currentQuestion = activeQuizQuestions[questionIndex]
  const currentReviewResult = isReviewingWrongAnswers ? wrongResults[questionIndex] : null
  const currentAnswerOptions = normalizeQuizOptions(currentQuestion)
  const completedCount = activeQuizQuestions.length
  const normalSessionTotal =
    practiceMode === 'final'
      ? finalTestSessionQuestions.length
      : practiceMode === 'marked'
        ? markedReviewQuestions.length
        : practiceMode === 'random-study'
          ? randomStudySessionQuestions.length
          : topicSessionQuestions.length
  const totalAnswered = sessionResults.length
  const correctCount = sessionResults.filter((result) => result.isCorrect).length
  const wrongCount = wrongResults.length
  const scorePercent = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0
  const activeQuestionPool = questions.filter((item) => item.status === 'active')
  const activeQuestions = activeQuestionPool.length
  const sourceDocuments = getUniqueReferenceValues(questions, 'sourceDocument')
  const referenceTopics = getUniqueReferenceValues(questions, 'topic')
  const memoryTopics = Array.from(new Set(MEMORY_ITEMS.map((item) => item.topic))).sort((first, second) =>
    first.localeCompare(second, undefined, { numeric: true }),
  )
  const memoryCategories = Array.from(new Set(MEMORY_ITEMS.map((item) => item.category))).sort((first, second) =>
    first.localeCompare(second, undefined, { numeric: true }),
  )
  const normalizedMemorySearch = memorySearch.trim().toLowerCase()
  const filteredMemoryItems = MEMORY_ITEMS.filter((item) => {
    const matchesTopic = !memoryTopicFilter || item.topic === memoryTopicFilter
    const matchesCategory = !memoryCategoryFilter || item.category === memoryCategoryFilter
    const matchesSearch = !normalizedMemorySearch || getMemoryItemSearchText(item).includes(normalizedMemorySearch)

    return matchesTopic && matchesCategory && matchesSearch
  })
  const memoryStatsSummary = getMemoryStatsSummary(MEMORY_ITEMS, memoryErrorStats)
  const filteredMemoryStatsSummary = getMemoryStatsSummary(filteredMemoryItems, memoryErrorStats)
  const referencedQuestions = questions.filter(hasReferenceMetadata)
  const questionsWithManualReference = questions.filter(
    (item) => displayReferenceValue(item.manualReference) !== '—',
  ).length
  const questionsWithSourcePage = questions.filter((item) => displayReferenceValue(item.sourcePage) !== '—').length
  const normalizedReferenceSearch = referenceSearch.trim().toLowerCase()
  const filteredReferences = questions.filter((item) => {
    const matchesSource = !referenceSourceFilter || item.sourceDocument === referenceSourceFilter
    const matchesTopic = !referenceTopicFilter || item.topic === referenceTopicFilter
    const searchFields = [
      item.question,
      item.topic,
      item.manualReference,
      item.sourceDocument,
      item.sourceId,
    ]
    const matchesSearch =
      !normalizedReferenceSearch ||
      searchFields.some((field) => String(field ?? '').toLowerCase().includes(normalizedReferenceSearch))

    return matchesSource && matchesTopic && matchesSearch
  })
  const hasManualCatalog = manualDocuments.length > 0
  const isManualSignedIn = Boolean(manualSession)
  const manualSearchManualTypes = getUniqueReferenceValues(manualDocuments, 'manual_type')
  const manualSearchAircraftOptions = getUniqueReferenceValues(manualDocuments, 'aircraft')
  const topicPerformanceRows = topics.map((topic) => {
    const stats = topicStats[topic] || {}
    const answeredTotal = Number(stats.totalAnswered) || 0
    const correctTotal = Number(stats.correctCount) || 0
    const wrongTotal = Number(stats.wrongCount) || 0
    const accuracy = answeredTotal > 0 ? Math.round((correctTotal / answeredTotal) * 100) : null
    const status = getTopicStatus(answeredTotal, accuracy || 0)

    return {
      topic,
      totalAnswered: answeredTotal,
      correctCount: correctTotal,
      wrongCount: wrongTotal,
      attemptsCount: Number(stats.attemptsCount) || 0,
      bestScore: Number(stats.bestScore) || 0,
      lastScore: Number(stats.lastScore) || 0,
      lastPracticedAt: stats.lastPracticedAt || '',
      accuracy,
      status,
    }
  })
  const statusOrder = {
    'Needs Focus': 0,
    'Not Studied': 1,
    Good: 2,
    Strong: 3,
  }
  const sortedTopicPerformanceRows = [...topicPerformanceRows].sort((first, second) => {
    const statusDifference = statusOrder[first.status] - statusOrder[second.status]

    if (statusDifference !== 0) return statusDifference
    if (first.status === 'Needs Focus') return (first.accuracy || 0) - (second.accuracy || 0)
    if (first.status === 'Strong' || first.status === 'Good') return (second.accuracy || 0) - (first.accuracy || 0)
    return first.topic.localeCompare(second.topic)
  })
  const totalTopicAnswered = topicPerformanceRows.reduce((sum, row) => sum + row.totalAnswered, 0)
  const totalTopicCorrect = topicPerformanceRows.reduce((sum, row) => sum + row.correctCount, 0)
  const practicedTopicCount = topicPerformanceRows.filter((row) => row.totalAnswered > 0).length
  const studiedToday = totalTopicAnswered > 0 ? totalTopicAnswered : '—'
  const accuracyLabel = totalTopicAnswered > 0 ? `${Math.round((totalTopicCorrect / totalTopicAnswered) * 100)}%` : '—'
  const weakTopicCount = topicPerformanceRows.filter((row) => row.status === 'Needs Focus').length
  const weakTopicsLabel = totalTopicAnswered > 0 ? weakTopicCount : '—'
  const progressPercent = isSessionComplete
    ? 100
    : completedCount > 0
      ? Math.round(((questionIndex + (answered || isReviewingWrongAnswers ? 1 : 0)) / completedCount) * 100)
      : 0
  const currentQuestionKey = currentQuestion ? getQuestionStorageKey(currentQuestion) : ''
  const currentQuestionMarked = Boolean(currentQuestion && markedQuestions[currentQuestion.topic]?.[currentQuestionKey])

  const hydrateSessionResults = (storedResults = []) => storedResults
    .map((result) => {
      const question = questionLookup.get(result.questionKey)

      if (!question) return null

      return {
        question,
        selectedAnswerIndex: result.selectedAnswerIndex ?? null,
        selectedAnswerKey: result.selectedAnswerKey || '',
        selectedAnswerText: result.selectedAnswerText || '',
        correctAnswerKey: result.correctAnswerKey || getCorrectAnswerKey(question),
        correctAnswerText: result.correctAnswerText || '',
        isCorrect: Boolean(result.isCorrect),
      }
    })
    .filter(Boolean)

  const getValidStoredTopicSession = (topic) => {
    const storedSession = loadStoredInProgressTopicSessions()[topic]

    if (!storedSession || storedSession.completed) return null
    if (!Array.isArray(storedSession.questionKeys) || storedSession.questionKeys.length === 0) return null

    const sessionQuestions = storedSession.questionKeys
      .map((questionKey) => questionLookup.get(questionKey))
      .filter(Boolean)

    if (sessionQuestions.length !== storedSession.questionKeys.length) return null
    if (sessionQuestions.some((question) => question.topic !== topic)) return null

    return {
      ...storedSession,
      questions: sessionQuestions,
      sessionResults: hydrateSessionResults(storedSession.sessionResults),
    }
  }

  const clearInProgressSession = (topic) => {
    if (!topic) return

    const next = { ...loadStoredInProgressTopicSessions() }
    delete next[topic]
    saveStoredInProgressTopicSessions(next)
  }

  const getSafeRandomStudyCount = (value = randomStudyCount) => {
    const fallbackCount = Math.min(20, activeQuestionPool.length)
    const numericValue = Number(value)

    if (!Number.isFinite(numericValue) || numericValue < 1) {
      return Math.max(fallbackCount, 1)
    }

    return Math.min(Math.max(Math.round(numericValue), 1), activeQuestionPool.length)
  }

  const handleRandomStudyCountChange = (value) => {
    setRandomStudyCount(value)
  }

  const handleRandomStudyPreset = (count) => {
    setRandomStudyCount(Math.min(count, activeQuestionPool.length || count))
  }

  const startRandomStudySession = (requestedCount = randomStudyCount) => {
    const safeCount = getSafeRandomStudyCount(requestedCount)
    const selectedQuestions = shuffleArray(activeQuestionPool).slice(0, safeCount)

    setPracticeMode('random-study')
    setIsReviewingWrongAnswers(false)
    setIsSessionComplete(false)
    setSessionResults([])
    setFinalTestSessionQuestions([])
    setMarkedReviewQuestions([])
    setTopicSessionQuestions([])
    setRandomStudySessionQuestions(selectedQuestions)
    setRandomStudyCount(safeCount)
    setQuestionIndex(0)
    setAnswered(false)
    setSelectedAnswer(null)
    setCorrect(false)
    setView('quiz')
  }

  const handleOpenStudySetup = () => {
    setView('study-setup')
  }

  const startNewTopicSession = (topic = currentTopic) => {
    const randomizedQuestions = shuffleArray(questions.filter((item) => item.topic === topic))

    setPracticeMode('topic')
    setIsReviewingWrongAnswers(false)
    setIsSessionComplete(false)
    setSessionResults([])
    setFinalTestSessionQuestions([])
    setMarkedReviewQuestions([])
    setRandomStudySessionQuestions([])
    setTopicSessionQuestions(randomizedQuestions)
    setSelectedTopic(topic)
    setQuestionIndex(0)
    setAnswered(false)
    setSelectedAnswer(null)
    setCorrect(false)
    clearInProgressSession(topic)
    setView('quiz')
  }

  const restoreTopicSession = (topic, storedSession) => {
    const safeIndex = Math.min(Number(storedSession.questionIndex) || 0, storedSession.questions.length - 1)

    setPracticeMode('topic')
    setIsReviewingWrongAnswers(false)
    setIsSessionComplete(false)
    setSessionResults(storedSession.sessionResults)
    setFinalTestSessionQuestions([])
    setMarkedReviewQuestions([])
    setRandomStudySessionQuestions([])
    setTopicSessionQuestions(storedSession.questions)
    setSelectedTopic(topic)
    setQuestionIndex(safeIndex)
    setSelectedAnswer(storedSession.selectedAnswer ?? null)
    setAnswered(Boolean(storedSession.answered))
    setCorrect(Boolean(storedSession.correct))
    setView('quiz')
  }

  const handleStartQuiz = (topic = currentTopic) => {
    const storedSession = getValidStoredTopicSession(topic)

    if (storedSession) {
      setPendingResumeTopic(topic)
      return
    }

    startNewTopicSession(topic)
  }

  const handleContinueStudy = () => {
    if (practiceMode === 'topic' && topicSessionQuestions.length > 0 && !isSessionComplete) {
      setIsReviewingWrongAnswers(false)
      setView('quiz')
      return
    }

    handleOpenStudySetup()
  }

  const handleStartFinalTest = () => {
    const selectedQuestions = selectFinalTestQuestions({
      questions,
      scope: finalTestScope,
      selectedTopics: finalTestSelectedTopics,
      requestedCount: finalTestCount,
    })

    setPracticeMode('final')
    setIsReviewingWrongAnswers(false)
    setIsSessionComplete(false)
    setSessionResults([])
    setFinalTestSessionQuestions(selectedQuestions)
    setTopicSessionQuestions([])
    setRandomStudySessionQuestions([])
    setMarkedReviewQuestions([])
    setFinalTestSessionConfig({
      scope: finalTestScope,
      count: finalTestCount,
      selectedTopics: [...finalTestSelectedTopics],
    })
    setQuestionIndex(0)
    setAnswered(false)
    setSelectedAnswer(null)
    setCorrect(false)
    setView('quiz')
  }

  const handleRetrySession = () => {
    if (practiceMode === 'final') {
      const selectedQuestions = selectFinalTestQuestions({
        questions,
        scope: finalTestSessionConfig.scope,
        selectedTopics: finalTestSessionConfig.selectedTopics,
        requestedCount: finalTestSessionConfig.count,
      })

      setFinalTestSessionQuestions(selectedQuestions)
    } else if (practiceMode === 'random-study') {
      startRandomStudySession(randomStudyCount)
      return
    } else if (practiceMode === 'topic') {
      startNewTopicSession(currentTopic)
      return
    }

    setIsReviewingWrongAnswers(false)
    setIsSessionComplete(false)
    setSessionResults([])
    setQuestionIndex(0)
    setSelectedAnswer(null)
    setAnswered(false)
    setCorrect(false)
    setView('quiz')
  }

  const handleAnswerClick = (option) => {
    if (answered || !currentQuestion) return
    setSelectedAnswer(option.originalIndex)
  }

  const handleCheckAnswer = () => {
    if (answered || !currentQuestion || selectedAnswer === null) return
    const correctAnswerKey = getCorrectAnswerKey(currentQuestion)
    const selectedOption = currentAnswerOptions.find((option) => option.originalIndex === selectedAnswer)
    const correctOption = currentAnswerOptions.find((option) => option.key === correctAnswerKey)
    const isCorrect = selectedOption?.key === correctAnswerKey

    if (!isReviewingWrongAnswers) {
      setSessionResults((current) => {
        const nextResult = {
          question: currentQuestion,
          selectedAnswerIndex: selectedOption?.originalIndex ?? null,
          selectedAnswerKey: selectedOption?.key || '',
          selectedAnswerText: selectedOption?.text || '',
          correctAnswerKey,
          correctAnswerText: correctOption?.text || '',
          isCorrect,
        }
        const existingIndex = current.findIndex((result) => result.question.id === currentQuestion.id)

        if (existingIndex === -1) {
          return [...current, nextResult]
        }

        return current.map((result, index) => (index === existingIndex ? nextResult : result))
      })
    }

    setCorrect(isCorrect)
    setAnswered(true)
  }

  const recordTopicSessionStats = () => {
    if (practiceMode !== 'topic' || isReviewingWrongAnswers || !currentTopic || totalAnswered === 0) return

    setTopicStats((current) => {
      const previousStats = current[currentTopic] || {}
      const previousTotalAnswered = Number(previousStats.totalAnswered) || 0
      const previousCorrectCount = Number(previousStats.correctCount) || 0
      const previousWrongCount = Number(previousStats.wrongCount) || 0
      const previousAttemptsCount = Number(previousStats.attemptsCount) || 0
      const previousBestScore = Number(previousStats.bestScore) || 0
      const nextStats = {
        ...current,
        [currentTopic]: {
          topic: currentTopic,
          totalAnswered: previousTotalAnswered + totalAnswered,
          correctCount: previousCorrectCount + correctCount,
          wrongCount: previousWrongCount + wrongCount,
          attemptsCount: previousAttemptsCount + 1,
          bestScore: Math.max(previousBestScore, scorePercent),
          lastScore: scorePercent,
          lastPracticedAt: new Date().toISOString(),
        },
      }

      saveStoredTopicStats(nextStats)
      return nextStats
    })
  }

  const handleNextQuestion = () => {
    if (questionIndex + 1 >= activeQuizQuestions.length) {
      if (isReviewingWrongAnswers) {
        setIsReviewingWrongAnswers(false)
      } else if (practiceMode === 'topic') {
        recordTopicSessionStats()
        clearInProgressSession(currentTopic)
      }
      setIsSessionComplete(true)
      setQuestionIndex(0)
      setSelectedAnswer(null)
      setAnswered(false)
      setCorrect(false)
      return
    }

    setSelectedAnswer(null)
    setAnswered(false)
    setCorrect(false)
    setQuestionIndex((current) => {
      const next = current + 1
      return next < activeQuizQuestions.length ? next : 0
    })
  }

  const handleBackToDashboard = () => {
    setView('dashboard')
    setSelectedAnswer(null)
    setAnswered(false)
    setCorrect(false)
    setIsReviewingWrongAnswers(false)
    setIsSessionComplete(false)
    setSessionResults([])
    setQuestionIndex(0)
  }

  const handleExitPractice = () => {
    setView('dashboard')
    setSelectedAnswer(null)
    setAnswered(false)
    setCorrect(false)
    setIsReviewingWrongAnswers(false)
  }

  const handleReviewWrongAnswers = () => {
    if (wrongResults.length === 0) return
    setIsReviewingWrongAnswers(true)
    setIsSessionComplete(false)
    setQuestionIndex(0)
    setSelectedAnswer(null)
    setAnswered(false)
    setCorrect(false)
  }

  const handleNextWrongAnswer = () => {
    if (questionIndex + 1 >= wrongResults.length) {
      setIsReviewingWrongAnswers(false)
      setIsSessionComplete(true)
      setQuestionIndex(0)
      return
    }

    setQuestionIndex((current) => current + 1)
  }

  const handleFinalTestScopeChange = (scope) => {
    setFinalTestScope(scope)
  }

  const handleFinalTestTopicToggle = (topic) => {
    setFinalTestSelectedTopics((current) => (
      current.includes(topic)
        ? current.filter((item) => item !== topic)
        : [...current, topic]
    ))
  }

  const handleResetStudyProgress = () => {
    const shouldReset = window.confirm('Reset local study progress? Questions, manuals, and Supabase data will not be changed.')

    if (!shouldReset) return

    setTopicStats({})
    clearStoredStudyProgress()
  }

  const handleToggleMarkForReview = () => {
    if (!currentQuestion) return
    const questionKey = getQuestionStorageKey(currentQuestion)
    const topic = currentQuestion.topic

    setMarkedQuestions((current) => {
      const topicMarks = { ...(current[topic] || {}) }

      if (topicMarks[questionKey]) {
        delete topicMarks[questionKey]
      } else {
        topicMarks[questionKey] = new Date().toISOString()
      }

      const next = { ...current }

      if (Object.keys(topicMarks).length > 0) {
        next[topic] = topicMarks
      } else {
        delete next[topic]
      }

      saveStoredMarkedQuestions(next)
      return next
    })
  }

  const getMarkedQuestionsForTopic = (topic) => Object.keys(markedQuestions[topic] || {})
    .map((questionKey) => questionLookup.get(questionKey))
    .filter((question) => question?.topic === topic)

  const handleStartMarkedReview = (topic) => {
    const reviewQuestions = getMarkedQuestionsForTopic(topic)

    if (reviewQuestions.length === 0) return

    setPracticeMode('marked')
    setIsReviewingWrongAnswers(false)
    setIsSessionComplete(false)
    setSessionResults([])
    setFinalTestSessionQuestions([])
    setTopicSessionQuestions([])
    setRandomStudySessionQuestions([])
    setMarkedReviewQuestions(reviewQuestions)
    setSelectedTopic(topic)
    setQuestionIndex(0)
    setAnswered(false)
    setSelectedAnswer(null)
    setCorrect(false)
    setView('quiz')
  }

  const handleResumeTopicSession = () => {
    const storedSession = getValidStoredTopicSession(pendingResumeTopic)

    if (storedSession) {
      restoreTopicSession(pendingResumeTopic, storedSession)
    }

    setPendingResumeTopic('')
  }

  const handleRestartTopicSession = () => {
    const topic = pendingResumeTopic

    setPendingResumeTopic('')
    clearInProgressSession(topic)
    startNewTopicSession(topic)
  }

  const handleResetReferenceFilters = () => {
    setReferenceSourceFilter('')
    setReferenceTopicFilter('')
    setReferenceSearch('')
  }

  const createMemoryOrderShuffle = (item) => shuffleMemoryOrderSteps(getMemoryOrderSteps(item)).map((step) => step.id)

  const createMemoryOrderShuffleMap = (items) => items.reduce((shuffles, item) => ({
    ...shuffles,
    [item.id]: createMemoryOrderShuffle(item),
  }), {})

  const handleMemoryModeChange = (mode) => {
    setMemoryMode(mode)
    setMixedSession(null)

    if (mode === MEMORY_MODES.ORDER_DRILL) {
      setMemoryOrderSelections({})
      setMemoryOrderReveals({})
      setMemorySavedResults({})
      setMemoryOrderShuffles(createMemoryOrderShuffleMap(filteredMemoryItems))
    }
  }

  const handleOpenMemoryItems = (topic = '') => {
    setMemoryTopicFilter(topic)
    setMemoryCategoryFilter('')
    setMemorySearch('')
    setMemoryRevealedItems({})
    setMemoryBlindMarks({})
    setMemoryActionSelections({})
    setMemoryOrderSelections({})
    setMemoryOrderShuffles({})
    setMemoryOrderReveals({})
    setMemorySavedResults({})
    setMixedSession(null)
    setView('memory-items')
  }

  const handleResetMemoryFilters = () => {
    setMemoryTopicFilter('')
    setMemoryCategoryFilter('')
    setMemorySearch('')
  }

  const saveMemoryErrorResult = (memoryItemId, result, mode) => {
    setMemoryErrorStats((current) => {
      const previousStats = current[memoryItemId] || {}
      const totalChecks = (Number(previousStats.totalChecks) || 0) + result.checks
      const totalErrors = (Number(previousStats.totalErrors) || 0) + result.errors
      const nextStats = {
        attempts: (Number(previousStats.attempts) || 0) + 1,
        totalChecks,
        totalErrors,
        lastChecks: result.checks,
        lastErrors: result.errors,
        lastErrorRate: calculateMemoryErrorRate(result.errors, result.checks),
        averageErrorRate: calculateMemoryErrorRate(totalErrors, totalChecks),
        lastMode: mode,
        lastTestedAt: new Date().toISOString(),
      }
      const nextAllStats = {
        ...current,
        [memoryItemId]: nextStats,
      }

      saveStoredMemoryErrorStats(nextAllStats)
      return nextAllStats
    })

    setMemorySavedResults((current) => ({
      ...current,
      [`${mode}-${memoryItemId}`]: true,
    }))
  }

  const handleBlindLineMark = (memoryItemId, lineId, isCorrect) => {
    setMemoryBlindMarks((current) => ({
      ...current,
      [memoryItemId]: {
        ...(current[memoryItemId] || {}),
        [lineId]: isCorrect,
      },
    }))
  }

  const handleActionSelection = (memoryItemId, lineId, selectedValue) => {
    setMemoryActionSelections((current) => ({
      ...current,
      [memoryItemId]: {
        ...(current[memoryItemId] || {}),
        [lineId]: selectedValue,
      },
    }))
  }

  const handleOrderSelect = (memoryItemId, stepId) => {
    setMemoryOrderSelections((current) => ({
      ...current,
      [memoryItemId]: [...(current[memoryItemId] || []), stepId],
    }))
  }

  const handleOrderReset = (memoryItemId) => {
    setMemoryOrderSelections((current) => ({
      ...current,
      [memoryItemId]: [],
    }))
    const memoryItem = MEMORY_ITEMS.find((item) => item.id === memoryItemId)
    if (memoryItem) {
      setMemoryOrderShuffles((current) => ({
        ...current,
        [memoryItemId]: createMemoryOrderShuffle(memoryItem),
      }))
    }
    setMemoryOrderReveals((current) => ({
      ...current,
      [memoryItemId]: false,
    }))
  }

  const handleStartMixedTest = () => {
    const selectedItems = fisherYatesShuffle(filteredMemoryItems).slice(0, Math.min(10, filteredMemoryItems.length))

    setMixedSession({
      items: selectedItems,
      currentIndex: 0,
      results: {},
    })
    setMemoryRevealedItems({})
    setMemoryBlindMarks({})
    setMemoryActionSelections({})
    setMemoryOrderSelections({})
    setMemoryOrderShuffles({})
    setMemoryOrderReveals({})
    setMemorySavedResults({})
  }

  const handleSaveMixedResult = (memoryItemId, result) => {
    saveMemoryErrorResult(memoryItemId, result, MEMORY_MODES.MIXED_TEST)
    setMixedSession((current) => ({
      ...current,
      currentIndex: Math.min((Number(current?.currentIndex) || 0) + 1, current?.items?.length || 0),
      results: {
        ...(current?.results || {}),
        [memoryItemId]: result,
      },
    }))
  }

  const renderMemorySteps = (item) => (
    <ol className="memory-step-list">
      {item.steps.map((step) => (
        <li key={step.number}>
          <div className="memory-step-line">
            <span>{step.left}</span>
            {step.right && (
              <>
                <span className="memory-separator">—</span>
                <strong>{formatMemoryResponse(step.right)}</strong>
              </>
            )}
          </div>
          {step.substeps?.length > 0 && (
            <div className="memory-substep-list">
              {step.substeps.map((substep) => (
                <div className="memory-substep-line" key={`${step.number}-${substep.left}`}>
                  <span>{substep.left}</span>
                  {substep.right && (
                    <>
                      <span className="memory-separator">—</span>
                      <strong>{formatMemoryResponse(substep.right)}</strong>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  )

  const renderMemoryVisualCues = (item) => {
    if (!item.visualCues?.length) return null

    return (
      <div className="memory-visual-cues" aria-label={`${item.title} visual cues`}>
        {item.visualCues.map((cue, index) => (
          <div
            className={`memory-visual-cue memory-visual-cue-${cue.type} memory-visual-cue-${cue.color || 'amber'}`}
            key={`${cue.type}-${index}-${cue.lines.join('-')}`}
          >
            {cue.lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        ))}
      </div>
    )
  }

  const renderFullMemoryItemReference = (item) => (
    <div className="memory-full-reference">
      <h4>Full memory item</h4>
      {renderMemoryVisualCues(item)}
      {renderMemorySteps(item)}
    </div>
  )

  const renderMemoryItemHeader = (item) => {
    const statusText = getMemoryStatusText(memoryErrorStats[item.id])

    return (
      <div className="memory-item-header">
        <div>
          <h3>{item.title}</h3>
          <span className="memory-aircraft-badge">737NG</span>
          {item.subtitle && <p>{item.subtitle}</p>}
        </div>
        <div className="memory-status-list">
          {statusText.map((text) => (
            <span className={`memory-status-chip ${getMemoryStatusClass(text)}`} key={text}>{text}</span>
          ))}
        </div>
      </div>
    )
  }

  const renderBlindRecall = (item, saveHandler = saveMemoryErrorResult) => {
    const lines = getMemoryAssessableLines(item)
    const marks = memoryBlindMarks[item.id] || {}
    const result = getMemoryResultFromMarks(lines, marks)
    const allMarked = lines.length > 0 && lines.every((line) => marks[line.id] !== undefined)
    const revealed = Boolean(memoryRevealedItems[item.id])
    const saved = Boolean(memorySavedResults[`${MEMORY_MODES.BLIND_RECALL}-${item.id}`])

    if (!revealed) {
      return (
        <div className="memory-drill-panel">
          <p>Recall the memory items.</p>
          <button
            className="button button-primary"
            onClick={() => setMemoryRevealedItems((current) => ({ ...current, [item.id]: true }))}
          >
            Reveal items
          </button>
        </div>
      )
    }

    return (
      <>
        {renderMemoryVisualCues(item)}
        <ol className="memory-step-list">
          {item.steps.map((step) => {
            const parentLineId = `${item.id}-step-${step.number}`

            return (
              <li key={step.number}>
                <div className="memory-assessment-row">
                  <div className="memory-step-line">
                    <span>{step.left}</span>
                    {step.right && (
                      <>
                        <span className="memory-separator">—</span>
                        <strong>{formatMemoryResponse(step.right)}</strong>
                      </>
                    )}
                  </div>
                  <div className="memory-line-actions">
                    <button
                      className={marks[parentLineId] === true ? 'button button-secondary button-small memory-choice-active' : 'button button-ghost button-small'}
                      onClick={() => handleBlindLineMark(item.id, parentLineId, true)}
                    >
                      Correct
                    </button>
                    <button
                      className={marks[parentLineId] === false ? 'button button-secondary button-small memory-choice-active' : 'button button-ghost button-small'}
                      onClick={() => handleBlindLineMark(item.id, parentLineId, false)}
                    >
                      Wrong / Missed
                    </button>
                  </div>
                </div>
                {step.substeps?.length > 0 && (
                  <div className="memory-substep-list">
                    {step.substeps.map((substep, index) => {
                      const substepLineId = `${item.id}-step-${step.number}-substep-${index}`

                      return (
                        <div className="memory-assessment-row memory-substep-assessment-row" key={substepLineId}>
                          <div className="memory-substep-line">
                            <span>{substep.left}</span>
                            {substep.right && (
                              <>
                                <span className="memory-separator">—</span>
                                <strong>{formatMemoryResponse(substep.right)}</strong>
                              </>
                            )}
                          </div>
                          <div className="memory-line-actions">
                            <button
                              className={marks[substepLineId] === true ? 'button button-secondary button-small memory-choice-active' : 'button button-ghost button-small'}
                              onClick={() => handleBlindLineMark(item.id, substepLineId, true)}
                            >
                              Correct
                            </button>
                            <button
                              className={marks[substepLineId] === false ? 'button button-secondary button-small memory-choice-active' : 'button button-ghost button-small'}
                              onClick={() => handleBlindLineMark(item.id, substepLineId, false)}
                            >
                              Wrong / Missed
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
        {allMarked && (
          <div className="memory-result-panel">
            <span>Errors: {result.errors} / {result.checks}</span>
            <span>Error rate: {result.errorRate}%</span>
            <button
              className="button button-primary"
              onClick={() => saveHandler(item.id, result, MEMORY_MODES.BLIND_RECALL)}
              disabled={saved}
            >
              {saved ? 'Saved' : 'Save result'}
            </button>
          </div>
        )}
      </>
    )
  }

  const renderActionDrill = (item, saveHandler = saveMemoryErrorResult) => {
    const lines = getMemoryActionLines(item)
    const selections = memoryActionSelections[item.id] || {}
    const checks = lines.length
    const errors = lines.filter((line) => selections[line.id] && selections[line.id] !== line.right).length
    const allAnswered = checks > 0 && lines.every((line) => selections[line.id])
    const result = {
      checks,
      errors,
      errorRate: calculateMemoryErrorRate(errors, checks),
    }
    const saved = Boolean(memorySavedResults[`${MEMORY_MODES.ACTION_DRILL}-${item.id}`])

    if (lines.length === 0) {
      return <p className="memory-drill-empty">No right-side values to drill for this item.</p>
    }

    return (
      <div className="memory-question-list">
        {lines.map((line) => (
          <div className="memory-drill-question" key={line.id}>
            <div className="memory-step-line">
              <span>{line.left}</span>
              <span className="memory-separator">—</span>
              <strong>?</strong>
            </div>
            <div className="memory-answer-options">
              {getMemoryActionOptions(line).map((option) => {
                const selected = selections[line.id] === option
                const hasSelection = Boolean(selections[line.id])
                const isCorrectOption = option === line.right
                const optionClass = hasSelection
                  ? isCorrectOption
                    ? 'answer-button answer-correct'
                    : selected
                    ? 'answer-button answer-wrong'
                    : 'answer-button answer-disabled'
                  : 'answer-button'

                return (
                  <button
                    className={optionClass}
                    key={option}
                    onClick={() => handleActionSelection(item.id, line.id, option)}
                    disabled={hasSelection}
                  >
                    {formatMemoryResponse(option)}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {allAnswered && (
          <>
            <div className="memory-result-panel">
              <span>Errors: {result.errors} / {result.checks}</span>
              <span>Error rate: {result.errorRate}%</span>
              <button
                className="button button-primary"
                onClick={() => saveHandler(item.id, result, MEMORY_MODES.ACTION_DRILL)}
                disabled={saved}
              >
                {saved ? 'Saved' : 'Save result'}
              </button>
            </div>
            {renderFullMemoryItemReference(item)}
          </>
        )}
      </div>
    )
  }

  const renderMixedChecklistLineActions = (item, line) => {
    if (line.right) {
      const selections = memoryActionSelections[item.id] || {}
      const selectedValue = selections[line.id]

      return (
        <div className="memory-answer-options">
          {getMemoryActionOptions(line).map((option) => {
            const selected = selectedValue === option
            const hasSelection = Boolean(selectedValue)
            const isCorrectOption = option === line.right
            const optionClass = hasSelection
              ? isCorrectOption
                ? 'answer-button answer-correct'
                : selected
                ? 'answer-button answer-wrong'
                : 'answer-button answer-disabled'
              : 'answer-button'

            return (
              <button
                className={optionClass}
                key={option}
                onClick={() => handleActionSelection(item.id, line.id, option)}
                disabled={hasSelection}
              >
                {formatMemoryResponse(option)}
              </button>
            )
          })}
        </div>
      )
    }

    const marks = memoryBlindMarks[item.id] || {}

    return (
      <div className="memory-line-actions">
        <button
          className={marks[line.id] === true ? 'button button-secondary button-small memory-choice-active' : 'button button-ghost button-small'}
          onClick={() => handleBlindLineMark(item.id, line.id, true)}
        >
          Correct
        </button>
        <button
          className={marks[line.id] === false ? 'button button-secondary button-small memory-choice-active' : 'button button-ghost button-small'}
          onClick={() => handleBlindLineMark(item.id, line.id, false)}
        >
          Wrong / Missed
        </button>
      </div>
    )
  }

  const getMixedChecklistResult = (item) => {
    const lines = getMemoryAssessableLines(item)
    const selections = memoryActionSelections[item.id] || {}
    const marks = memoryBlindMarks[item.id] || {}
    const allAnswered = lines.every((line) => (line.right ? Boolean(selections[line.id]) : marks[line.id] !== undefined))
    const errors = lines.filter((line) => (
      line.right ? selections[line.id] && selections[line.id] !== line.right : marks[line.id] === false
    )).length

    return {
      checks: lines.length,
      errors,
      errorRate: calculateMemoryErrorRate(errors, lines.length),
      allAnswered,
    }
  }

  const renderMixedChecklist = (item) => {
    const result = getMixedChecklistResult(item)
    const saved = Boolean(mixedSession?.results?.[item.id])

    return (
      <article className="memory-item-card" key={`mixed-${item.id}`}>
        {renderMemoryItemHeader(item)}
        {renderMemoryVisualCues(item)}
        <ol className="memory-step-list memory-mixed-step-list">
          {item.steps.map((step) => {
            const parentLine = {
              id: `${item.id}-step-${step.number}`,
              left: step.left,
              right: step.right || '',
            }

            return (
              <li key={step.number}>
                <div className="memory-drill-question memory-mixed-line">
                  <div className="memory-step-line">
                    <span>{step.left}</span>
                    {step.right && (
                      <>
                        <span className="memory-separator">—</span>
                        <strong>?</strong>
                      </>
                    )}
                  </div>
                  {renderMixedChecklistLineActions(item, parentLine)}
                </div>
                {step.substeps?.length > 0 && (
                  <div className="memory-substep-list">
                    {step.substeps.map((substep, index) => {
                      const substepLine = {
                        id: `${item.id}-step-${step.number}-substep-${index}`,
                        left: substep.left,
                        right: substep.right || '',
                      }

                      return (
                        <div className="memory-drill-question memory-mixed-line" key={substepLine.id}>
                          <div className="memory-substep-line">
                            <span>{substep.left}</span>
                            {substep.right && (
                              <>
                                <span className="memory-separator">—</span>
                                <strong>?</strong>
                              </>
                            )}
                          </div>
                          {renderMixedChecklistLineActions(item, substepLine)}
                        </div>
                      )
                    })}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
        {result.allAnswered && (
          <div className="memory-result-panel">
            <span>Errors: {result.errors} / {result.checks}</span>
            <span>Error rate: {result.errorRate}%</span>
            <button
              className="button button-primary"
              onClick={() => handleSaveMixedResult(item.id, result)}
              disabled={saved}
            >
              {saved ? 'Saved' : 'Save result'}
            </button>
          </div>
        )}
      </article>
    )
  }

  const renderOrderDrill = (item, saveHandler = saveMemoryErrorResult) => {
    const steps = getMemoryOrderSteps(item)
    const selectedIds = memoryOrderSelections[item.id] || []
    const selectedSet = new Set(selectedIds)
    const shuffledStepIds = memoryOrderShuffles[item.id] || createMemoryOrderShuffle(item)
    const availableSteps = shuffledStepIds
      .map((stepId) => steps.find((step) => step.id === stepId))
      .filter((step) => step && !selectedSet.has(step.id))
    const selectedSteps = selectedIds.map((stepId) => steps.find((step) => step.id === stepId)).filter(Boolean)
    const complete = steps.length > 0 && selectedIds.length === steps.length
    const errors = complete ? selectedIds.filter((stepId, index) => stepId !== steps[index].id).length : 0
    const result = {
      checks: steps.length,
      errors,
      errorRate: calculateMemoryErrorRate(errors, steps.length),
    }
    const saved = Boolean(memorySavedResults[`${MEMORY_MODES.ORDER_DRILL}-${item.id}`])

    return (
      <div className="memory-order-layout">
        <div className="memory-order-column">
          <h4>Available items</h4>
          {availableSteps.map((step) => (
            <button className="memory-order-item" key={step.id} onClick={() => handleOrderSelect(item.id, step.id)}>
              <span>{step.left}</span>
              {step.right && <strong>{formatMemoryResponse(step.right)}</strong>}
            </button>
          ))}
        </div>
        <div className="memory-order-column">
          <h4>Your order</h4>
          {selectedSteps.length === 0 ? (
            <p className="memory-drill-empty">Tap items in sequence.</p>
          ) : (
            selectedSteps.map((step, index) => (
              <div className="memory-order-item memory-order-item-selected" key={step.id}>
                <span>{index + 1}. {step.left}</span>
                {step.right && <strong>{formatMemoryResponse(step.right)}</strong>}
              </div>
            ))
          )}
          <div className="memory-review-actions">
            <button className="button button-ghost button-small" onClick={() => handleOrderReset(item.id)}>
              Reset order
            </button>
            {complete && (
              <button
                className="button button-secondary button-small"
                onClick={() => setMemoryOrderReveals((current) => ({ ...current, [item.id]: true }))}
              >
                Show correct order
              </button>
            )}
          </div>
        </div>
        {complete && (
          <div className="memory-result-panel memory-order-result">
            <span>Order errors: {result.errors} / {result.checks}</span>
            <span>Error rate: {result.errorRate}%</span>
            <button
              className="button button-primary"
              onClick={() => saveHandler(item.id, result, MEMORY_MODES.ORDER_DRILL)}
              disabled={saved}
            >
              {saved ? 'Saved' : 'Save result'}
            </button>
          </div>
        )}
        {memoryOrderReveals[item.id] && (
          <div className="memory-correct-order">
            <h4>Correct order</h4>
            {steps.map((step, index) => (
              <div className="memory-step-line" key={step.id}>
                <span>{index + 1}. {step.left}</span>
                {step.right && (
                  <>
                    <span className="memory-separator">—</span>
                    <strong>{formatMemoryResponse(step.right)}</strong>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderMemoryPracticeCard = (item, mode, saveHandler = saveMemoryErrorResult) => (
    <article className="memory-item-card" key={`${mode}-${item.id}`}>
      {renderMemoryItemHeader(item)}
      {mode !== MEMORY_MODES.BLIND_RECALL && renderMemoryVisualCues(item)}
      {mode === MEMORY_MODES.STUDY && renderMemorySteps(item)}
      {mode === MEMORY_MODES.BLIND_RECALL && renderBlindRecall(item, saveHandler)}
      {mode === MEMORY_MODES.ACTION_DRILL && renderActionDrill(item, saveHandler)}
      {mode === MEMORY_MODES.ORDER_DRILL && renderOrderDrill(item, saveHandler)}
    </article>
  )

  const handleManualSignIn = async (event) => {
    event.preventDefault()
    setManualAuthError('')

    const { data, error } = await signInWithEmailPassword(
      manualAuthEmail.trim(),
      manualAuthPassword,
    )

    if (error) {
      setManualAuthError('Unable to sign in. Check the authorized account credentials.')
      return
    }

    setManualSession(data)
    setManualAuthPassword('')
  }

  const handleManualSignOut = async () => {
    setManualAuthError('')
    setManualOpenError('')
    setManualCardErrors({})
    setFallbackManualLink(null)

    const { error } = await signOut()

    if (error) {
      setManualAuthError('Unable to sign out. Try again.')
      return
    }

    setManualSession(null)
  }

  const handleOpenManual = async (manual) => {
    setManualOpenError('')
    setManualCardErrors({})
    setFallbackManualLink(null)
    setOpeningManualId(manual.id)

    const { signedUrl, error } = await createSignedManualUrl(manual.storage_path, manual.storage_bucket)

    setOpeningManualId(null)

    if (error || !signedUrl) {
      setManualCardErrors({
        [manual.id]: 'Unable to open manual. Check authorization, storage policy and file path.',
      })
      return
    }

    const manualWindow = window.open(signedUrl, '_blank', 'noopener,noreferrer')

    if (!manualWindow) {
      setFallbackManualLink({
        manualId: manual.id,
        signedUrl,
      })
    }
  }

  const handleOpenFallbackManual = () => {
    if (!fallbackManualLink?.signedUrl) return

    window.open(fallbackManualLink.signedUrl, '_blank', 'noopener,noreferrer')
    setFallbackManualLink(null)
  }

  const handleManualSearch = async (event) => {
    event.preventDefault()
    const trimmedManualSearchQuery = manualSearchQuery.trim()

    if (!trimmedManualSearchQuery) {
      setManualSearchResults([])
      setManualSearchError('')
      setHasManualSearchRun(true)
      return
    }

    setIsManualSearchLoading(true)
    setManualSearchError('')
    setHasManualSearchRun(true)

    const { data, error } = await loadManualChunksSearch({
      query: trimmedManualSearchQuery,
      manualType: manualSearchManualType,
      aircraft: manualSearchAircraft,
      limit: 20,
    })

    setIsManualSearchLoading(false)

    if (error) {
      setManualSearchResults([])
      setHasManualChunks(false)
      setManualSearchError('Manual search index is not available yet.')
      return
    }

    setManualSearchResults(data || [])
    setHasManualChunks((current) => current || Boolean(data?.length))
  }

  const handleClearManualSearch = () => {
    setManualSearchQuery('')
    setManualSearchManualType('')
    setManualSearchAircraft('')
    setManualSearchResults([])
    setManualSearchError('')
    setHasManualSearchRun(false)
  }

  const handleNewQuestion = () => {
    setAdminMode('new')
    setAdminForm(EMPTY_ADMIN_FORM)
    setAdminFormError('')
    setAdminPreview(null)
  }

  const handleEditQuestion = (question) => {
    setAdminMode(`edit-${question.id}`)
    setAdminForm(buildAdminFormFromQuestion(question))
    setAdminFormError('')
    setAdminPreview(null)
  }

  const handleAdminFieldChange = (event) => {
    const { name, value } = event.target
    setAdminForm((current) => ({
      ...current,
      [name]: value,
    }))
    setAdminFormError('')
    setAdminPreview(null)
  }

  const handlePreviewChanges = () => {
    const validationError = validateAdminForm(adminForm)

    if (validationError) {
      setAdminFormError(validationError)
      setAdminPreview(null)
      return
    }

    setAdminPreview(normalizeAdminForm(adminForm))
    setAdminFormError('')
  }

  const handleCancelAdminForm = () => {
    setAdminForm(null)
    setAdminMode(null)
    setAdminFormError('')
    setAdminPreview(null)
  }

  useEffect(() => {
    if (
      view !== 'quiz' ||
      practiceMode !== 'topic' ||
      isReviewingWrongAnswers ||
      isSessionComplete ||
      !currentTopic ||
      topicSessionQuestions.length === 0
    ) {
      return
    }

    const storedSession = {
      topic: currentTopic,
      questionKeys: topicSessionQuestions.map(getQuestionStorageKey),
      questionIndex,
      selectedAnswer,
      answered,
      correct,
      sessionResults: buildStoredSessionResults(sessionResults),
      completed: false,
    }

    saveStoredInProgressTopicSessions({
      ...loadStoredInProgressTopicSessions(),
      [currentTopic]: {
        ...storedSession,
        updatedAt: new Date().toISOString(),
      },
    })
  }, [
    answered,
    correct,
    currentTopic,
    isReviewingWrongAnswers,
    isSessionComplete,
    practiceMode,
    questionIndex,
    selectedAnswer,
    sessionResults,
    topicSessionQuestions,
    view,
  ])

  useEffect(() => {
    if (view !== 'memory-items' || memoryMode !== MEMORY_MODES.ORDER_DRILL) return

    setMemoryOrderSelections({})
    setMemoryOrderReveals({})
    setMemorySavedResults({})
    setMemoryOrderShuffles(createMemoryOrderShuffleMap(filteredMemoryItems))
  }, [memoryCategoryFilter, memoryMode, memorySearch, memoryTopicFilter, view])

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">B737 Study App</p>
          <h1>Study Questions</h1>
          <p className="subtitle">
            Practice the question bank and prepare for the final test.
          </p>
        </div>
        <div className="header-status">
          {loadError && (
            <span className="status-chip status-chip-warning">
              {loadError}
            </span>
          )}
          <span className="version-badge">{APP_VERSION}</span>
        </div>
      </header>

      {isLoading && (
        <div className="info-banner">
          <span>Loading question database…</span>
        </div>
      )}

      {pendingResumeTopic && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="resume-topic-title">
            <p className="eyebrow">Topic Practice</p>
            <h2 id="resume-topic-title">Resume topic practice?</h2>
            <p>You have an unfinished session for this topic.</p>
            <div className="quiz-actions">
              <button className="button button-primary" onClick={handleResumeTopicSession}>
                Resume
              </button>
              <button className="button button-secondary" onClick={handleRestartTopicSession}>
                Restart
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="app-layout">
        <aside className="sidebar-nav" aria-label="Primary navigation">
          {[
            ['dashboard', 'Dashboard'],
            ['study-setup', 'Study'],
            ['topics', 'Topics'],
            ['memory-items', 'Memory Items'],
            ['stats', 'Stats'],
            ['final-test', 'Final Test'],
          ].map(([targetView, label]) => (
            <button
              key={targetView}
              className={
                view === targetView ||
                (targetView === 'study-setup' && view === 'quiz' && practiceMode === 'random-study')
                  ? 'sidebar-link sidebar-link-active'
                  : 'sidebar-link'
              }
              onClick={() => {
                if (targetView === 'study-setup') {
                  handleOpenStudySetup()
                } else {
                  setView(targetView)
                }
              }}
            >
              {label}
            </button>
          ))}
        </aside>

      <main className="app-main">
        {view === 'dashboard' && (
          <section className="dashboard-view">
            <div className="primary-actions-grid">
              <article className="action-card action-card-primary">
                <h3>Continue</h3>
                <p>Resume practice.</p>
                <div className="card-actions">
                  <button
                    className="button button-primary"
                    onClick={handleContinueStudy}
                    disabled={isLoading || questions.length === 0}
                  >
                    Continue
                  </button>
                </div>
              </article>

              <article className="action-card">
                <h3>Study</h3>
                <p>Random questions from the full database.</p>
                <div className="card-actions">
                  <button
                    className="button button-secondary"
                    onClick={handleOpenStudySetup}
                    disabled={isLoading}
                  >
                    Start Study
                  </button>
                </div>
              </article>

              <article className="action-card">
                <h3>Final Test</h3>
                <p>Random exam-style run.</p>
                <div className="card-actions">
                  <button
                    className="button button-primary"
                    onClick={() => setView('final-test')}
                    disabled={isLoading || questions.length === 0}
                  >
                    Start Final Test
                  </button>
                </div>
              </article>

              <article className={`action-card memory-card ${
                memoryStatsSummary.testedCount > 0
                  ? `memory-card-${getMemoryErrorSeverity(memoryStatsSummary.averageErrorRate)}`
                  : 'memory-card-neutral'
              }`}>
                <h3 className="memory-title-critical">MEMORY ITEMS</h3>
                <span className="memory-aircraft-badge">737NG</span>
                <p>{MEMORY_ITEMS.length} total</p>
                {memoryStatsSummary.testedCount > 0 ? (
                  <p>
                    Average error: <strong className={`memory-error-value memory-error-${getMemoryErrorSeverity(memoryStatsSummary.averageErrorRate)}`}>{memoryStatsSummary.averageErrorRate}%</strong>
                    {memoryStatsSummary.highestErrorItem && (
                      <>
                        <br />
                        Worst: {memoryStatsSummary.highestErrorItem.item.title} — <strong className={`memory-error-value memory-error-${getMemoryErrorSeverity(memoryStatsSummary.highestErrorItem.averageErrorRate)}`}>{memoryStatsSummary.highestErrorItem.averageErrorRate}%</strong>
                      </>
                    )}
                  </p>
                ) : (
                  <p>No tests yet</p>
                )}
                <div className="card-actions">
                  <button
                    className="button button-secondary"
                    onClick={() => handleOpenMemoryItems()}
                  >
                    Memory Items
                  </button>
                </div>
              </article>
            </div>

            <div className="metrics-strip">
              <div>
                <span>Questions</span>
                <strong>{questions.length}</strong>
              </div>
              <div>
                <span>Studied</span>
                <strong>{studiedToday}</strong>
              </div>
              <div>
                <span>Accuracy</span>
                <strong>{accuracyLabel}</strong>
              </div>
              <div>
                <span>Weak Topics</span>
                <strong>{weakTopicsLabel}</strong>
              </div>
              <div>
                <span>Memory Items</span>
                <strong>{MEMORY_ITEMS.length}</strong>
              </div>
            </div>

            <section className="topic-performance-section">
              <div className="section-header section-header-compact">
                <div>
                  <p className="eyebrow">Topic Performance</p>
                  <h2>Topic Performance</h2>
                  <p className="subtitle">See where to focus next.</p>
                </div>
                {practicedTopicCount > 0 && (
                  <button className="button button-ghost button-small" onClick={handleResetStudyProgress}>
                    Reset study progress
                  </button>
                )}
              </div>

              {practicedTopicCount === 0 ? (
                <div className="topic-performance-empty">
                  No topic results yet. Complete a topic practice session to see strengths and weak areas.
                </div>
              ) : (
                <div className="topic-performance-list">
                  {sortedTopicPerformanceRows.map((row) => (
                    <div className="topic-performance-row" key={row.topic}>
                      <div className="topic-performance-main">
                        <strong>{row.topic}</strong>
                        <span>{row.totalAnswered > 0 ? `${row.correctCount}/${row.totalAnswered} correct` : 'Not practiced'}</span>
                      </div>
                      <div className="topic-performance-meter" aria-label={`${row.topic} accuracy`}>
                        <span style={{ width: `${row.accuracy || 0}%` }} />
                      </div>
                      <div className="topic-performance-score">
                        <strong>{row.accuracy === null ? '—' : `${row.accuracy}%`}</strong>
                        <span>{row.wrongCount} wrong</span>
                      </div>
                      <span className={`topic-status topic-status-${row.status.toLowerCase().replace(/\s+/g, '-')}`}>
                        {row.status}
                      </span>
                      <button className="button button-secondary button-small" onClick={() => handleStartQuiz(row.topic)}>
                        Practice
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </section>
        )}

        {view === 'study-setup' && (
          <section className="study-setup-view">
            <div className="section-header">
              <div>
                <p className="eyebrow">Study</p>
                <h2>Study</h2>
                <p className="subtitle">Random questions from the full database.</p>
              </div>
              <button className="button button-ghost" onClick={handleBackToDashboard}>
                Back to dashboard
              </button>
            </div>

            <article className="study-setup-panel">
              <div>
                <p className="eyebrow">Random Study</p>
                <h3>Random Study</h3>
                <p>Choose how many questions to practice.</p>
              </div>

              <div className="setup-group">
                <span>Question count</span>
                <div className="segmented-control segmented-control-compact study-count-presets">
                  {[10, 20, 30, 50, 100].map((count) => (
                    <button
                      key={count}
                      className={Number(randomStudyCount) === Math.min(count, activeQuestionPool.length || count) ? 'segmented-option segmented-option-active' : 'segmented-option'}
                      onClick={() => handleRandomStudyPreset(count)}
                      disabled={activeQuestionPool.length === 0}
                    >
                      {count}
                    </button>
                  ))}
                </div>
                <label className="field-label study-custom-count">
                  Custom
                  <input
                    type="number"
                    min="1"
                    max={activeQuestionPool.length || 1}
                    value={randomStudyCount}
                    onChange={(event) => handleRandomStudyCountChange(event.target.value)}
                    onBlur={() => setRandomStudyCount(getSafeRandomStudyCount())}
                  />
                </label>
              </div>

              <p className="setup-note">Available questions: {activeQuestionPool.length}</p>

              <div className="card-actions">
                <button
                  className="button button-primary"
                  onClick={() => startRandomStudySession()}
                  disabled={activeQuestionPool.length === 0}
                >
                  Start Random Study
                </button>
                <button className="button button-ghost" onClick={handleBackToDashboard}>
                  Back to dashboard
                </button>
              </div>
            </article>
          </section>
        )}

        {view === 'topics' && (
          <section className="topics-view">
            <div className="section-header">
              <div>
                <p className="eyebrow">Topics</p>
                <h2>Topic Practice</h2>
                <p className="subtitle">Choose a topic.</p>
              </div>
              <button className="button button-ghost" onClick={handleBackToDashboard}>
                Back to dashboard
              </button>
            </div>
            <div className="topic-grid topic-grid-full">
              {topics.map((topic) => {
                const count = questions.filter((item) => item.topic === topic).length
                const markedCount = getMarkedQuestionsForTopic(topic).length
                return (
                  <article className="topic-card" key={topic}>
                    <h3>{topic}</h3>
                    <p>{count} questions</p>
                    <button
                      className="button button-secondary"
                      onClick={() => handleStartQuiz(topic)}
                      disabled={count === 0}
                    >
                      Start practice
                    </button>
                    <button
                      className="button button-ghost button-small"
                      onClick={() => handleStartMarkedReview(topic)}
                      disabled={markedCount === 0}
                    >
                      {markedCount > 0 ? `Marked (${markedCount})` : 'No marked questions'}
                    </button>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {view === 'memory-items' && (
          <section className="memory-items-view">
            <div className="section-header">
              <div>
                <p className="eyebrow">Memory Items</p>
                <h2>Memory Items</h2>
                <div className="memory-header-badges">
                  <span className="memory-aircraft-badge">737NG</span>
                  <span className="memory-critical-badge">CRITICAL RECALL ITEMS</span>
                </div>
                <p className="subtitle">QRH-style recall items with error-rate practice.</p>
              </div>
              <button className="button button-ghost" onClick={handleBackToDashboard}>
                Back to dashboard
              </button>
            </div>

            <div className="memory-mode-row">
              <div className="segmented-control">
                {[
                  [MEMORY_MODES.STUDY, 'Study'],
                  [MEMORY_MODES.BLIND_RECALL, 'Blind Recall'],
                  [MEMORY_MODES.ACTION_DRILL, 'Action Drill'],
                  [MEMORY_MODES.ORDER_DRILL, 'Order Drill'],
                  [MEMORY_MODES.MIXED_TEST, 'Mixed Test'],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    className={memoryMode === mode ? 'segmented-option segmented-option-active' : 'segmented-option'}
                    onClick={() => handleMemoryModeChange(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="memory-filters">
              <button className="button button-secondary" onClick={handleResetMemoryFilters}>
                All topics
              </button>
              <label className="field-label">
                Topic
                <select value={memoryTopicFilter} onChange={(event) => setMemoryTopicFilter(event.target.value)}>
                  <option value="">All topics</option>
                  {memoryTopics.map((topic) => (
                    <option key={topic} value={topic}>
                      {topic}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Category
                <select value={memoryCategoryFilter} onChange={(event) => setMemoryCategoryFilter(event.target.value)}>
                  <option value="">All categories</option>
                  {memoryCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Search
                <input
                  type="search"
                  value={memorySearch}
                  onChange={(event) => setMemorySearch(event.target.value)}
                  placeholder="Search memory items"
                />
              </label>
            </div>

            <div className="reference-result-count">
              Showing {filteredMemoryItems.length} of {MEMORY_ITEMS.length} memory items
              {filteredMemoryStatsSummary.testedCount > 0 && ` · Average error: ${filteredMemoryStatsSummary.averageErrorRate}%`}
            </div>

            {memoryMode === MEMORY_MODES.MIXED_TEST ? (
              <div className="memory-item-list">
                {!mixedSession && (
                  <article className="memory-item-card">
                    <div className="memory-item-header">
                      <div>
                        <h3>Mixed Test</h3>
                        <p>{Math.min(10, filteredMemoryItems.length)} memory items from the current filters.</p>
                      </div>
                    </div>
                    <div className="card-actions">
                      <button
                        className="button button-primary"
                        onClick={handleStartMixedTest}
                        disabled={filteredMemoryItems.length === 0}
                      >
                        Start Mixed Test
                      </button>
                    </div>
                  </article>
                )}

                {mixedSession && (
                  <>
                    <div className="reference-result-count">
                      Mixed Test: {Object.keys(mixedSession.results).length} of {mixedSession.items.length} saved
                    </div>
                    {mixedSession.currentIndex < mixedSession.items.length && (
                      <>
                        <p className="memory-mixed-mode-label">
                          Checklist {mixedSession.currentIndex + 1} of {mixedSession.items.length}
                        </p>
                        {renderMixedChecklist(mixedSession.items[mixedSession.currentIndex])}
                      </>
                    )}
                    {mixedSession.items.length > 0 && mixedSession.currentIndex >= mixedSession.items.length && (
                      <article className="memory-item-card">
                        <div className="memory-result-panel">
                          <span>Memory Items tested: {mixedSession.items.length}</span>
                          <span>
                            Total errors: {Object.values(mixedSession.results).reduce((sum, result) => sum + result.errors, 0)} / {Object.values(mixedSession.results).reduce((sum, result) => sum + result.checks, 0)}
                          </span>
                          <span>
                            Error rate: {calculateMemoryErrorRate(
                              Object.values(mixedSession.results).reduce((sum, result) => sum + result.errors, 0),
                              Object.values(mixedSession.results).reduce((sum, result) => sum + result.checks, 0),
                            )}%
                          </span>
                        </div>
                      </article>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="memory-item-list">
                {filteredMemoryItems.map((item) => renderMemoryPracticeCard(item, memoryMode))}
              </div>
            )}
          </section>
        )}

        {view === 'final-test' && (
          <section className="final-test-view">
            <article className="final-test-panel">
              <p className="eyebrow">Final Test</p>
              <h2>Final Test</h2>
              <p>Randomized exam-style practice.</p>

              <div className="final-test-setup-grid">
                <div className="setup-group">
                  <span>Test scope</span>
                  <div className="segmented-control">
                    {Object.entries(FINAL_TEST_SCOPE_LABELS).map(([scope, label]) => (
                      <button
                        key={scope}
                        className={finalTestScope === scope ? 'segmented-option segmented-option-active' : 'segmented-option'}
                        onClick={() => handleFinalTestScopeChange(scope)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="setup-group">
                  <span>Questions</span>
                  <div className="segmented-control segmented-control-compact">
                    {FINAL_TEST_COUNT_OPTIONS.map((count) => (
                      <button
                        key={count}
                        className={finalTestCount === count ? 'segmented-option segmented-option-active' : 'segmented-option'}
                        onClick={() => setFinalTestCount(count)}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {finalTestScope === FINAL_TEST_SCOPES.SELECTED_TOPICS && (
                <div className="topic-select-panel">
                  <span>Selected topics</span>
                  <div className="topic-checkbox-grid">
                    {topics.map((topic) => (
                      <label className="topic-checkbox" key={topic}>
                        <input
                          type="checkbox"
                          checked={finalTestSelectedTopics.includes(topic)}
                          onChange={() => handleFinalTestTopicToggle(topic)}
                        />
                        <span>{topic}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <dl className="reference-meta">
                <div>
                  <dt>Scope</dt>
                  <dd>{finalTestScopeLabel}</dd>
                </div>
                <div>
                  <dt>Available</dt>
                  <dd>{finalTestAvailableCount}</dd>
                </div>
                <div>
                  <dt>Test size</dt>
                  <dd>{finalTestPlannedCount}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{dataSource}</dd>
                </div>
              </dl>
              {finalTestAvailableCount > 0 && finalTestAvailableCount < finalTestCount && (
                <p className="setup-note">Only {finalTestAvailableCount} questions available for this scope.</p>
              )}
              {finalTestScope === FINAL_TEST_SCOPES.SELECTED_TOPICS && finalTestSelectedTopics.length === 0 && (
                <p className="setup-note">Select at least one topic to build this test.</p>
              )}
              <div className="card-actions">
                <button
                  className="button button-primary"
                  onClick={handleStartFinalTest}
                  disabled={finalTestAvailableCount === 0}
                >
                  Start Final Test
                </button>
                <button className="button button-ghost" onClick={handleBackToDashboard}>
                  Back to dashboard
                </button>
              </div>
            </article>
          </section>
        )}

        {view === 'quiz' && (
          <section className="quiz-view">
            <div className="practice-topbar">
              <div>
                <p className="eyebrow">
                  {isReviewingWrongAnswers
                    ? 'Review'
                    : practiceMode === 'final'
                      ? 'Final test simulation'
                      : practiceMode === 'marked'
                        ? 'Marked review'
                        : practiceMode === 'random-study'
                          ? 'Random study'
                          : 'Topic practice'}
                </p>
                <h2>{activeQuizTitle}</h2>
                <p className="subtitle">
                  {isSessionComplete ? 'Results' : `Question ${questionIndex + 1} of ${completedCount}`}
                </p>
                {practiceMode === 'final' && !isReviewingWrongAnswers && (
                  <p className="quiz-scope-label">{activeFinalTestScopeLabel}</p>
                )}
              </div>
              <div className="practice-progress">
                <div className="progress-track">
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
                <span>{progressPercent}%</span>
              </div>
              <button className="button button-ghost" onClick={handleExitPractice}>
                Exit practice
              </button>
            </div>

            {isSessionComplete ? (
              <article className="question-card session-complete-card">
                <p className="eyebrow">Session Complete</p>
                <h3>
                  {practiceMode === 'marked'
                    ? 'Marked Review Complete'
                    : practiceMode === 'random-study'
                      ? 'Random Study Complete'
                      : 'Session Complete'}
                </h3>
                <p>
                  {practiceMode === 'final'
                    ? `Final Test Simulation · ${activeFinalTestScopeLabel}`
                    : practiceMode === 'marked'
                      ? `${currentTopic} · Marked Review Complete`
                      : practiceMode === 'random-study'
                        ? 'Random Study'
                        : currentTopic}
                </p>
                <div className="result-summary-grid">
                  <div>
                    <span>Total answered</span>
                    <strong>{totalAnswered}</strong>
                  </div>
                  <div>
                    <span>Correct</span>
                    <strong>{correctCount}</strong>
                  </div>
                  <div>
                    <span>Wrong</span>
                    <strong>{wrongCount}</strong>
                  </div>
                  <div>
                    <span>Score</span>
                    <strong>{scorePercent}%</strong>
                  </div>
                </div>
                {wrongCount === 0 && totalAnswered > 0 && (
                  <p className="perfect-score-message">Perfect score. No wrong answers to review.</p>
                )}
                <div className="quiz-actions">
                  {wrongCount > 0 && (
                    <button className="button button-primary" onClick={handleReviewWrongAnswers}>
                      Review Wrong Answers
                    </button>
                  )}
                  <button className="button button-secondary" onClick={handleRetrySession}>
                    {practiceMode === 'final'
                      ? 'Retry Final Test'
                      : practiceMode === 'marked'
                        ? 'Review Again'
                        : practiceMode === 'random-study'
                          ? 'Retry Random Study'
                          : 'Retry Topic'}
                  </button>
                  {practiceMode === 'random-study' && (
                    <button className="button button-ghost" onClick={handleOpenStudySetup}>
                      Back to Study
                    </button>
                  )}
                  {practiceMode !== 'final' && practiceMode !== 'marked' && practiceMode !== 'random-study' && (
                    <button className="button button-ghost" onClick={() => setView('topics')}>
                      Choose Another Topic
                    </button>
                  )}
                  {practiceMode === 'marked' && (
                    <button className="button button-ghost" onClick={() => setView('topics')}>
                      Back to Topics
                    </button>
                  )}
                  <button className="button button-ghost" onClick={handleBackToDashboard}>
                    Back to Dashboard
                  </button>
                </div>
              </article>
            ) : currentQuestion ? (
              <div className="practice-layout">
                <article className="question-card practice-question-card">
                  <p className="question-id">Question ID: {displayQuestionSourceId(currentQuestion)}</p>
                  <h3>{cleanQuestionText(currentQuestion.question)}</h3>
                  <div className={`answer-grid answer-grid-${currentAnswerOptions.length}`}>
                    {currentAnswerOptions.map((option) => {
                      const isSelected = selectedAnswer === option.originalIndex
                      const isPreviousSelection = currentReviewResult?.selectedAnswerIndex === option.originalIndex
                      const isCorrectAnswer = getCorrectAnswerKey(currentQuestion) === option.key
                      const answerClass = answered
                        ? isCorrectAnswer
                          ? 'answer-button answer-correct'
                          : isSelected
                          ? 'answer-button answer-wrong'
                          : 'answer-button answer-disabled'
                        : isReviewingWrongAnswers
                        ? isCorrectAnswer
                          ? 'answer-button answer-correct'
                          : isPreviousSelection
                          ? 'answer-button answer-wrong'
                          : 'answer-button answer-disabled'
                        : isSelected
                        ? 'answer-button answer-selected'
                        : 'answer-button'

                      return (
                        <button
                          key={`${option.key}-${option.originalIndex}`}
                          className={answerClass}
                          onClick={() => handleAnswerClick(option)}
                          disabled={answered || isReviewingWrongAnswers}
                        >
                          <span className="answer-key">{option.key}</span>
                          <span className="answer-text">{option.text}</span>
                        </button>
                      )
                    })}
                  </div>

                  {answered && (
                    <div className={correct ? 'feedback feedback-correct' : 'feedback feedback-wrong'}>
                      <strong>{correct ? 'Correct answer' : 'Wrong answer'}</strong>
                      <span>
                        Selected: {currentAnswerOptions.find((option) => option.originalIndex === selectedAnswer)?.key || '—'} · Correct: {getCorrectAnswerKey(currentQuestion)}
                      </span>
                    </div>
                  )}

                  {isReviewingWrongAnswers && currentReviewResult && (
                    <div className="feedback feedback-review">
                      <strong>Previous answer: {currentReviewResult.selectedAnswerKey} — {cleanAnswerText(currentReviewResult.selectedAnswerText)}</strong>
                      <span>Correct answer: {currentReviewResult.correctAnswerKey} — {cleanAnswerText(currentReviewResult.correctAnswerText)}</span>
                    </div>
                  )}

                  <div className="quiz-actions">
                    {isReviewingWrongAnswers ? (
                      <button className="button button-primary" onClick={handleNextWrongAnswer}>
                        {questionIndex + 1 < wrongResults.length ? 'Next Wrong Answer' : 'Back to Results'}
                      </button>
                    ) : (
                      <>
                        <button className="button button-primary" onClick={answered ? handleNextQuestion : handleCheckAnswer} disabled={!answered && selectedAnswer === null}>
                          {answered ? (questionIndex + 1 < normalSessionTotal ? 'Next Question' : 'Finish Session') : 'Check Answer'}
                        </button>
                        <button className="button button-secondary" onClick={handleToggleMarkForReview}>
                          {currentQuestionMarked ? 'Unmark' : 'Mark for Review'}
                        </button>
                      </>
                    )}
                  </div>
                </article>

              </div>
            ) : (
              <article className="question-card">
                <p>No questions are available for this topic.</p>
                <button className="button button-secondary" onClick={handleBackToDashboard}>
                  Back to dashboard
                </button>
              </article>
            )}
          </section>
        )}

        {view === 'database' && (
          <section className="database-view">
            <div className="section-header">
              <div>
                <p className="eyebrow">Question Database</p>
                <h2>Full question bank</h2>
                <p className="subtitle">Review official answers and topic status for each entry.</p>
              </div>
              <button className="button button-ghost" onClick={handleBackToDashboard}>
                Back to dashboard
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Question ID</th>
                    <th>Topic</th>
                    <th>Question</th>
                    <th>Correct</th>
                    <th>Difficulty</th>
                    <th>Status</th>
                    <th>Manual reference</th>
                    <th>Source page</th>
                    <th>Source document</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((item) => (
                    <tr key={item.id}>
                      <td>{displayQuestionSourceId(item)}</td>
                      <td>{item.topic}</td>
                      <td>{cleanQuestionText(item.question)}</td>
                      <td>{item.correctAnswerLetter || String.fromCharCode(65 + item.correctAnswer)}</td>
                      <td>{item.difficulty || '—'}</td>
                      <td>{item.status}</td>
                      <td>{displayReferenceValue(item.manualReference)}</td>
                      <td>{displayReferenceValue(item.sourcePage)}</td>
                      <td>{displayReferenceValue(item.sourceDocument)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {view === 'manual-references' && (
          <section className="manual-references-view">
            <div className="section-header">
              <div>
                <p className="eyebrow">Manual References</p>
                <h2>Manual References</h2>
                <p className="subtitle">
                  Browse the source metadata linked to the current question bank. Manual files are stored privately. Raw manual chunk search is available. AI explanations are not enabled in this app.
                </p>
              </div>
              <button className="button button-ghost" onClick={handleBackToDashboard}>
                Back to dashboard
              </button>
            </div>

            <div className="reference-summary-grid">
              <div className="stat-card">
                <span>Total referenced questions</span>
                <strong>{referencedQuestions.length}</strong>
              </div>
              <div className="stat-card">
                <span>Source documents</span>
                <strong>{sourceDocuments.length}</strong>
              </div>
              <div className="stat-card">
                <span>Topics</span>
                <strong>{referenceTopics.length}</strong>
              </div>
              <div className="stat-card">
                <span>Questions with source page</span>
                <strong>{questionsWithSourcePage}</strong>
              </div>
              <div className="stat-card">
                <span>Current data source</span>
                <strong>{dataSource}</strong>
              </div>
            </div>

            <div className="reference-filters">
              <label className="field-label">
                Source document
                <select value={referenceSourceFilter} onChange={(event) => setReferenceSourceFilter(event.target.value)}>
                  <option value="">All source documents</option>
                  {sourceDocuments.map((sourceDocument) => (
                    <option key={sourceDocument} value={sourceDocument}>
                      {sourceDocument}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Topic
                <select value={referenceTopicFilter} onChange={(event) => setReferenceTopicFilter(event.target.value)}>
                  <option value="">All topics</option>
                  {referenceTopics.map((topic) => (
                    <option key={topic} value={topic}>
                      {topic}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Search
                <input
                  type="search"
                  value={referenceSearch}
                  onChange={(event) => setReferenceSearch(event.target.value)}
                  placeholder="Question, topic, manual, document, source ID"
                />
              </label>
              <button className="button button-secondary" onClick={handleResetReferenceFilters}>
                Reset Filters
              </button>
            </div>

            <div className="reference-result-count">
              Showing {filteredReferences.length} of {questions.length} questions
            </div>

            <section className="manual-library-panel">
              <div>
                <p className="eyebrow">Manual Library</p>
                <h3>Manual Library</h3>
                <p>
                  Files are stored in a private Supabase Storage bucket. Sign in with an authorized account to open private manuals.
                </p>
              </div>
              <div className="manual-access-panel">
                <div className="manual-access-header">
                  <span>
                    Manual access: {isManualSignedIn ? `signed in as ${manualSession?.user?.email || 'authorized user'}` : 'signed out'}
                  </span>
                  {isManualSignedIn && (
                    <button className="button button-ghost" onClick={handleManualSignOut}>
                      Sign out
                    </button>
                  )}
                </div>
                {!isManualSignedIn && (
                  <form className="manual-sign-in-form" onSubmit={handleManualSignIn}>
                    <label className="field-label">
                      Email
                      <input
                        type="email"
                        value={manualAuthEmail}
                        onChange={(event) => setManualAuthEmail(event.target.value)}
                        autoComplete="email"
                      />
                    </label>
                    <label className="field-label">
                      Password
                      <input
                        type="password"
                        value={manualAuthPassword}
                        onChange={(event) => setManualAuthPassword(event.target.value)}
                        autoComplete="current-password"
                      />
                    </label>
                    <button className="button button-secondary" type="submit">
                      Sign in
                    </button>
                    <p>
                      Manual opening is restricted to authorized Supabase Auth users. No public links are generated.
                    </p>
                  </form>
                )}
                {manualAuthError && <p className="form-error">{manualAuthError}</p>}
                {manualOpenError && <p className="form-error">{manualOpenError}</p>}
              </div>
              <section className="manual-search-panel">
                <div>
                  <p className="eyebrow">Raw chunk search</p>
                  <h3>Raw Manual Chunk Search</h3>
                  <p>
                    Search inside the imported manual chunks. This is not AI; it returns matching manual excerpts.
                  </p>
                  <p>
                    Use this to find manual references and page numbers. For explanations, open the referenced manual page or use ChatGPT Plus externally with the copied excerpt.
                  </p>
                  <p>
                    Tip: use Boeing terms exactly as written in the manual, e.g. 'speed trim' instead of 'trim speed'.
                  </p>
                  {manualChunksCount !== null && (
                    <p className="reference-result-count">
                      Manual chunks available: {manualChunksCount.toLocaleString()}
                    </p>
                  )}
                </div>
                <form className="manual-search-form" onSubmit={handleManualSearch}>
                  <label className="field-label">
                    Search inside manuals
                    <input
                      type="search"
                      value={manualSearchQuery}
                      onChange={(event) => setManualSearchQuery(event.target.value)}
                      placeholder="Search inside manuals, e.g. hydraulic, speed trim, rejected takeoff"
                    />
                  </label>
                  <label className="field-label">
                    Manual type
                    <select
                      value={manualSearchManualType}
                      onChange={(event) => setManualSearchManualType(event.target.value)}
                    >
                      <option value="">All manual types</option>
                      {manualSearchManualTypes.map((manualType) => (
                        <option key={manualType} value={manualType}>
                          {manualType}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Aircraft
                    <select
                      value={manualSearchAircraft}
                      onChange={(event) => setManualSearchAircraft(event.target.value)}
                    >
                      <option value="">All aircraft</option>
                      {manualSearchAircraftOptions.map((aircraft) => (
                        <option key={aircraft} value={aircraft}>
                          {aircraft}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="button button-secondary" type="submit" disabled={isManualSearchLoading}>
                    {isManualSearchLoading ? 'Searching…' : 'Search manuals'}
                  </button>
                  <button className="button button-ghost" type="button" onClick={handleClearManualSearch}>
                    Clear
                  </button>
                </form>
                {manualSearchError && <p className="form-error">{manualSearchError}</p>}
                {!hasManualChunks && (
                  <p className="manual-search-empty">
                    No indexed manual text yet. Run local indexing and import chunks before using manual search.
                  </p>
                )}
                {hasManualChunks && hasManualSearchRun && manualSearchResults.length === 0 && !manualSearchError && (
                  <p className="manual-search-empty">
                    No matching manual chunks found. Try the exact system name, abbreviation, or a shorter query.
                  </p>
                )}
                {manualSearchResults.length > 0 && (
                  <div className="manual-search-results">
                    {manualSearchResults.map((result) => (
                      <article className="manual-search-result" key={result.id}>
                        <div className="manual-catalog-header">
                          <strong>{displayReferenceValue(result.title || result.manual_code)}</strong>
                          <span>Page {displayReferenceValue(result.page_number)}</span>
                        </div>
                        <dl className="reference-meta">
                          <div>
                            <dt>Manual</dt>
                            <dd>{displayReferenceValue(result.manual_code)}</dd>
                          </div>
                          <div>
                            <dt>Page</dt>
                            <dd>{displayReferenceValue(result.page_number)}</dd>
                          </div>
                          <div>
                            <dt>Chunk</dt>
                            <dd>{displayReferenceValue(result.chunk_index)}</dd>
                          </div>
                          <div>
                            <dt>Storage path</dt>
                            <dd>{displayReferenceValue(result.storage_path)}</dd>
                          </div>
                        </dl>
                        <p>{createManualChunkExcerpt(result.chunk_text, manualSearchQuery)}</p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
              {hasManualCatalog ? (
                <div className="manual-catalog-list">
                  {manualDocuments.map((manual) => (
                    <article className="manual-catalog-item" key={manual.id}>
                      <div className="manual-catalog-header">
                        <strong>{manual.title}</strong>
                        <span>{manual.status}</span>
                      </div>
                      <dl className="reference-meta">
                        <div>
                          <dt>Aircraft</dt>
                          <dd>{displayReferenceValue(manual.aircraft)}</dd>
                        </div>
                        <div>
                          <dt>Manual type</dt>
                          <dd>{displayReferenceValue(manual.manual_type)}</dd>
                        </div>
                        <div>
                          <dt>Revision</dt>
                          <dd>{displayReferenceValue(manual.revision)}</dd>
                        </div>
                        <div>
                          <dt>Storage path</dt>
                          <dd>{displayReferenceValue(manual.storage_path)}</dd>
                        </div>
                      </dl>
                      <div className="manual-card-actions">
                        <button
                          className="button button-secondary"
                          onClick={() => handleOpenManual(manual)}
                          disabled={!isManualSignedIn || openingManualId === manual.id}
                        >
                          {openingManualId === manual.id
                            ? 'Preparing secure link…'
                            : isManualSignedIn
                              ? 'Open manual'
                              : 'Sign in to open'}
                        </button>
                        {fallbackManualLink?.manualId === manual.id && (
                          <button className="button button-primary" onClick={handleOpenFallbackManual}>
                            Open manual now
                          </button>
                        )}
                      </div>
                      {manualCardErrors[manual.id] && <p className="form-error">{manualCardErrors[manual.id]}</p>}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="manual-type-list" aria-busy={isManualCatalogLoading}>
                  {PLANNED_MANUAL_TYPES.map((manualType) => (
                    <div className="manual-type-item" key={manualType}>
                      <span>{manualType}</span>
                      <strong>Planned</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="reference-list">
              {filteredReferences.map((item) => (
                <article className="reference-card" key={item.id}>
                  <div className="reference-card-header">
                    <span className="question-id">Question ID: {displayQuestionSourceId(item)}</span>
                    <span>{displayReferenceValue(item.topic)}</span>
                  </div>
                  <h3>{cleanQuestionText(item.question)}</h3>
                  <dl className="reference-meta">
                    <div>
                      <dt>Manual reference</dt>
                      <dd>{displayReferenceValue(item.manualReference)}</dd>
                    </div>
                    <div>
                      <dt>Source document</dt>
                      <dd>{displayReferenceValue(item.sourceDocument)}</dd>
                    </div>
                    <div>
                      <dt>Source page</dt>
                      <dd>{displayReferenceValue(item.sourcePage)}</dd>
                    </div>
                    <div>
                      <dt>Difficulty</dt>
                      <dd>{displayReferenceValue(item.difficulty)}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{displayReferenceValue(item.status)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === 'admin' && (
          <section className="admin-view">
            <div className="section-header">
              <div>
                <p className="eyebrow">Admin Questions</p>
                <h2>Admin Questions</h2>
                <p className="subtitle">
                  Prepare question database changes. Write access is disabled until secure admin authentication is configured.
                </p>
              </div>
              <button className="button button-ghost" onClick={handleBackToDashboard}>
                Back to dashboard
              </button>
            </div>

            <div className="warning-banner">
              <span>
                Admin write mode is not enabled yet. Changes made here are preview-only and will not be saved to Supabase.
              </span>
            </div>

            <div className="admin-actions">
              <button className="button button-primary" onClick={handleNewQuestion}>
                New Question
              </button>
            </div>

            {adminForm && (
              <article className="admin-form-card">
                <div>
                  <p className="eyebrow">{adminMode === 'new' ? 'New Question' : 'Edit Question'}</p>
                  <h3>{adminMode === 'new' ? 'Prepare a new question' : 'Prepare question update'}</h3>
                </div>

                <div className="admin-form-grid">
                  <label className="field-label">
                    Topic
                    <input name="topic" value={adminForm.topic} onChange={handleAdminFieldChange} />
                  </label>
                  <label className="field-label">
                    Source question ID
                    <input name="source_id" value={adminForm.source_id} onChange={handleAdminFieldChange} />
                  </label>
                  <label className="field-label">
                    Subtopic
                    <input name="subtopic" value={adminForm.subtopic} onChange={handleAdminFieldChange} />
                  </label>
                  <label className="field-label admin-form-wide">
                    Question
                    <textarea name="question" value={adminForm.question} onChange={handleAdminFieldChange} rows="4" />
                  </label>
                  <label className="field-label">
                    Answer A
                    <input name="answer_a" value={adminForm.answer_a} onChange={handleAdminFieldChange} />
                  </label>
                  <label className="field-label">
                    Answer B
                    <input name="answer_b" value={adminForm.answer_b} onChange={handleAdminFieldChange} />
                  </label>
                  <label className="field-label">
                    Answer C
                    <input name="answer_c" value={adminForm.answer_c} onChange={handleAdminFieldChange} />
                  </label>
                  <label className="field-label">
                    Answer D
                    <input name="answer_d" value={adminForm.answer_d} onChange={handleAdminFieldChange} />
                  </label>
                  <label className="field-label">
                    Correct answer
                    <select name="correct_answer" value={adminForm.correct_answer} onChange={handleAdminFieldChange}>
                      {CORRECT_ANSWER_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Status
                    <select name="status" value={adminForm.status} onChange={handleAdminFieldChange}>
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Difficulty
                    <select name="difficulty" value={adminForm.difficulty} onChange={handleAdminFieldChange}>
                      {DIFFICULTY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Source document
                    <input name="source_document" value={adminForm.source_document} onChange={handleAdminFieldChange} />
                  </label>
                  <label className="field-label admin-form-wide">
                    Explanation
                    <textarea name="explanation" value={adminForm.explanation} onChange={handleAdminFieldChange} rows="4" />
                  </label>
                  <label className="field-label admin-form-wide">
                    Manual reference
                    <input name="manual_reference" value={adminForm.manual_reference} onChange={handleAdminFieldChange} />
                  </label>
                </div>

                {adminFormError && <p className="form-error">{adminFormError}</p>}

                <div className="admin-form-actions">
                  <button className="button button-primary" onClick={handlePreviewChanges}>
                    Preview Changes
                  </button>
                  <button className="button button-secondary" onClick={handleCancelAdminForm}>
                    Cancel
                  </button>
                  <div className="disabled-save-wrap">
                    <button className="button button-secondary" disabled title="Disabled until secure admin authentication is configured.">
                      Save to Supabase
                    </button>
                    <span>Disabled until secure admin authentication is configured.</span>
                  </div>
                </div>

                {adminPreview && (
                  <div className="preview-panel">
                    <p className="explanation-label">Preview object</p>
                    <pre>{JSON.stringify(adminPreview, null, 2)}</pre>
                  </div>
                )}
              </article>
            )}

            <div className="admin-list">
              {questions.map((item) => (
                <article className="admin-question-card" key={item.id}>
                  <div className="admin-question-body">
                    <span className="question-id">Question ID: {displayQuestionSourceId(item)}</span>
                    <h3>{cleanQuestionText(item.question)}</h3>
                    <dl className="admin-question-meta">
                      <div>
                        <dt>Question ID</dt>
                        <dd>{displayQuestionSourceId(item)}</dd>
                      </div>
                      <div>
                        <dt>Topic</dt>
                        <dd>{item.topic}</dd>
                      </div>
                      <div>
                        <dt>Correct answer</dt>
                        <dd>{item.correctAnswerLetter || String.fromCharCode(65 + item.correctAnswer)}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{item.status || '—'}</dd>
                      </div>
                      <div>
                        <dt>Difficulty</dt>
                        <dd>{item.difficulty || '—'}</dd>
                      </div>
                      <div>
                        <dt>Source document</dt>
                        <dd>{item.sourceDocument || '—'}</dd>
                      </div>
                    </dl>
                  </div>
                  <button className="button button-secondary" onClick={() => handleEditQuestion(item)}>
                    Edit
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === 'stats' && (
          <section className="stats-view">
            <div className="section-header">
              <div>
                <p className="eyebrow">Statistics</p>
                <h2>Study bank summary</h2>
                <p className="subtitle">Basic insights for your pilot review workflow.</p>
              </div>
              <button className="button button-ghost" onClick={handleBackToDashboard}>
                Back to dashboard
              </button>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <span>Total questions</span>
                <strong>{questions.length}</strong>
              </div>
              <div className="stat-card">
                <span>Topics</span>
                <strong>{topics.length}</strong>
              </div>
              <div className="stat-card">
                <span>Active questions</span>
                <strong>{activeQuestions}</strong>
              </div>
              <div className="stat-card">
                <span>Data source</span>
                <strong>{dataSource}</strong>
              </div>
              <div className="stat-card">
                <span>Source documents</span>
                <strong>{sourceDocuments.length}</strong>
              </div>
              <div className="stat-card">
                <span>Questions with manual reference</span>
                <strong>{questionsWithManualReference}</strong>
              </div>
              <div className="stat-card">
                <span>Questions with source page</span>
                <strong>{questionsWithSourcePage}</strong>
              </div>
              <div className="stat-card">
                <span>Total Memory Items</span>
                <strong>{MEMORY_ITEMS.length}</strong>
              </div>
              <div className="stat-card">
                <span>Tested Memory Items</span>
                <strong>{memoryStatsSummary.testedCount}</strong>
              </div>
              <div className="stat-card">
                <span>Memory Items average error</span>
                <strong>{memoryStatsSummary.testedCount > 0 ? `${memoryStatsSummary.averageErrorRate}%` : '—'}</strong>
              </div>
              <div className="stat-card">
                <span>Highest error item</span>
                <strong>{memoryStatsSummary.highestErrorItem ? `${memoryStatsSummary.highestErrorItem.averageErrorRate}%` : '—'}</strong>
                <small>{memoryStatsSummary.highestErrorItem?.item.title || 'No memory tests yet'}</small>
              </div>
            </div>
          </section>
        )}
      </main>
      </div>

      <footer className="app-footer">
        B737 Study App {APP_VERSION}
      </footer>
    </div>
  )
}

export default App
