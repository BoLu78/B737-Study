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

const APP_VERSION = 'v8.24'
const STUDY_PROGRESS_STORAGE_KEY = 'b737StudyProgress_v8_2'
const TOPIC_STATS_STORAGE_KEY = 'b737StudyTopicStats_v8_2'
const IN_PROGRESS_TOPIC_SESSIONS_STORAGE_KEY = 'b737StudyInProgressTopicSessions_v8_2'
const MARKED_QUESTIONS_STORAGE_KEY = 'b737StudyMarkedQuestions_v8_2'
const MEMORY_MODES = {
  STUDY: 'study',
  COMPARE: 'compare',
}
const MEMORY_AIRCRAFT = {
  NG: '737NG',
  MAX: '737MAX',
}
const MEMORY_AIRCRAFT_LABELS = {
  [MEMORY_AIRCRAFT.NG]: '737-800 NG',
  [MEMORY_AIRCRAFT.MAX]: '737-8 MAX',
}
const MEMORY_AIRCRAFT_OPTIONS = [MEMORY_AIRCRAFT.NG, MEMORY_AIRCRAFT.MAX]
const DEFAULT_MEMORY_AIRCRAFT = MEMORY_AIRCRAFT.NG
const PLANNED_MANUAL_TYPES = ['FCOM', 'FCTM', 'QRH', 'MEL', 'OM-B', 'CBT / Training Notes', 'T73 Question Bank']
const DATA_SOURCE_GENERATED = 'T73 R01 Excel question bank'
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
    sourceDocument: DATA_SOURCE_GENERATED,
    sourcePage: null,
    status: 'active',
    difficulty: null,
  }
})

function normalizeTopicDisplayName(topic) {
  return String(topic || '').replace(/\s+/g, ' ').trim()
}

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

function normalizeSearchValue(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function parseQuestionBankSearchQuery(query) {
  const normalizedQuery = String(query || '').replace(/\s+/g, ' ').trim()
  const phrases = []
  const remainingQuery = normalizedQuery.replace(/"([^"]+)"/g, (_, phrase) => {
    const normalizedPhrase = normalizeSearchValue(phrase)
    if (normalizedPhrase) {
      phrases.push(normalizedPhrase)
    }
    return ' '
  })
  const terms = remainingQuery
    .split(' ')
    .map(normalizeSearchValue)
    .filter(Boolean)

  return { phrases, terms }
}

function getQuestionBankSearchFields(question) {
  const options = normalizeQuizOptions(question)
  const correctAnswerKey = getCorrectAnswerKey(question)
  const correctAnswerText = options.find((option) => option.key === correctAnswerKey)?.text || ''

  return [
    question?.id,
    question?.sourceId,
    question?.topic,
    cleanQuestionText(question?.question || ''),
    ...ANSWER_KEYS.map((_, index) => cleanAnswerText(question?.answers?.[index] || '')),
    correctAnswerText,
    question?.manualReference,
    question?.sourceDocument,
  ]
}

function questionMatchesSearchQuery(question, parsedQuery) {
  const searchText = normalizeSearchValue(getQuestionBankSearchFields(question).join(' '))
  return [...parsedQuery.phrases, ...parsedQuery.terms].every((term) => searchText.includes(term))
}

function compareQuestionIds(firstQuestion, secondQuestion) {
  const firstId = Number(displayQuestionSourceId(firstQuestion))
  const secondId = Number(displayQuestionSourceId(secondQuestion))
  const firstHasNumericId = Number.isFinite(firstId)
  const secondHasNumericId = Number.isFinite(secondId)

  if (firstHasNumericId && secondHasNumericId) return firstId - secondId
  if (firstHasNumericId) return -1
  if (secondHasNumericId) return 1
  return 0
}

function getHighlightTerms(query) {
  const parsedQuery = parseQuestionBankSearchQuery(query)
  return [...parsedQuery.phrases, ...parsedQuery.terms]
    .filter(Boolean)
    .sort((first, second) => second.length - first.length)
}

function highlightSearchMatches(text, query) {
  const sourceText = String(text ?? '')
  const terms = getHighlightTerms(query)

  if (!sourceText || terms.length === 0) return sourceText

  return terms.reduce((parts, term) => (
    parts.flatMap((part, partIndex) => {
      if (typeof part !== 'string') return part

      const lowerPart = part.toLowerCase()
      const lowerTerm = term.toLowerCase()
      const termIndex = lowerPart.indexOf(lowerTerm)
      if (termIndex < 0) return part

      const before = part.slice(0, termIndex)
      const match = part.slice(termIndex, termIndex + term.length)
      const after = part.slice(termIndex + term.length)

      return [
        before,
        <mark key={`${term}-${partIndex}-${termIndex}`}>{match}</mark>,
        after,
      ].filter((item) => item !== '')
    })
  ), [sourceText])
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

function getMemoryItemAircraft(item) {
  return Array.isArray(item.aircraft) && item.aircraft.length > 0 ? item.aircraft : MEMORY_AIRCRAFT_OPTIONS
}

function isMemoryItemApplicableToAircraft(item, aircraft) {
  return getMemoryItemAircraft(item).includes(aircraft)
}

function hasMemoryAircraftVariant(item, aircraft) {
  return Boolean(item.variants?.[aircraft])
}

function resolveMemoryItemForAircraft(item, aircraft) {
  const variant = item.variants?.[aircraft] || {}

  return {
    ...item,
    ...variant,
    id: item.id,
    aircraft: getMemoryItemAircraft(item),
    variants: item.variants,
    selectedAircraft: aircraft,
    hasSelectedAircraftVariant: hasMemoryAircraftVariant(item, aircraft),
  }
}

function getMemoryAircraftBadgeLabel(item) {
  const aircraft = getMemoryItemAircraft(item)

  if (item.hasSelectedAircraftVariant) {
    return `${MEMORY_AIRCRAFT_LABELS[item.selectedAircraft]} VARIANT`
  }

  if (MEMORY_AIRCRAFT_OPTIONS.every((aircraftId) => aircraft.includes(aircraftId))) {
    return 'COMMON'
  }

  if (aircraft.includes(MEMORY_AIRCRAFT.NG)) return '737-800 NG ONLY'
  if (aircraft.includes(MEMORY_AIRCRAFT.MAX)) return '737-8 MAX ONLY'
  return 'VARIANT'
}

function getMemoryVisualCueSearchText(item) {
  const groups = item.visualCueGroups?.length
    ? item.visualCueGroups
    : item.visualCues?.length
      ? [{ label: '', cues: item.visualCues }]
      : []

  return groups.flatMap((group) => [
    group.label,
    ...(group.cues || []).flatMap((cue) => cue.lines || []),
  ])
}

function getMemoryCompareCueGroups(item, aircraft) {
  if (item.compare?.visualCueGroups?.[aircraft]) return item.compare.visualCueGroups[aircraft]
  const resolvedItem = resolveMemoryItemForAircraft(item, aircraft)
  return resolvedItem.visualCueGroups?.length
    ? resolvedItem.visualCueGroups
    : resolvedItem.visualCues?.length
      ? [{ label: '', cues: resolvedItem.visualCues }]
      : []
}

function normalizeMemoryCompareLine(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[.。]+$/u, '')
    .trim()
    .toLowerCase()
}

function getMemoryCompareLines(item, section, aircraft) {
  return item.compare?.[section]?.[aircraft] || []
}

function flattenMemoryStepsForCompare(item) {
  return item.steps.flatMap((step) => {
    if (step.type === 'note') return [`Note: ${step.text}`]

    return [
      `${step.number}. ${step.left}${step.right ? ` - ${step.right}` : ''}`,
      ...(step.substeps || []).map((substep) => `  ${substep.left}${substep.right ? ` - ${substep.right}` : ''}`),
    ]
  })
}

function getMemoryItemSearchText(item) {
  const stepTexts = item.steps.flatMap((step) => [
    step.text,
    step.left,
    step.right,
    ...(step.substeps || []).flatMap((substep) => [substep.left, substep.right]),
  ])

  return [
    item.title,
    item.titlePrimary,
    item.titleSecondary,
    item.titleTertiary,
    item.subtitle,
    item.topic,
    item.category,
    ...getMemoryVisualCueSearchText(item),
    ...stepTexts,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
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

function renderMemoryText(value, options = {}) {
  const text = String(value || '')

  if (!text) return null

  const emphasis = Array.isArray(options.emphasis) ? options.emphasis.filter(Boolean) : []
  const renderedText = emphasis.reduce((parts, phrase) => (
    parts.flatMap((part, partIndex) => {
      if (typeof part !== 'string') return part

      const phraseIndex = part.toLowerCase().indexOf(String(phrase).toLowerCase())
      if (phraseIndex < 0) return part

      const before = part.slice(0, phraseIndex)
      const match = part.slice(phraseIndex, phraseIndex + String(phrase).length)
      const after = part.slice(phraseIndex + String(phrase).length)

      return [
        before,
        <strong key={`${phrase}-${partIndex}-${phraseIndex}`}>{match}</strong>,
        after,
      ].filter((item) => item !== '')
    })
  ), [text])

  return options.bold ? <strong>{renderedText}</strong> : renderedText
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
  const [selectedMemoryAircraft, setSelectedMemoryAircraft] = useState(DEFAULT_MEMORY_AIRCRAFT)
  const [compareMemoryItemId, setCompareMemoryItemId] = useState('')
  const [memoryTopicFilter, setMemoryTopicFilter] = useState('')
  const [memoryCategoryFilter, setMemoryCategoryFilter] = useState('')
  const [memorySearch, setMemorySearch] = useState('')
  const [questionBankSearch, setQuestionBankSearch] = useState('')
  const [questionBankTopicFilter, setQuestionBankTopicFilter] = useState('')
  const [questionBankCorrectFilter, setQuestionBankCorrectFilter] = useState('')
  const [questionBankActiveOnly, setQuestionBankActiveOnly] = useState(false)
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
  const topicQuestionCounts = questions.reduce((counts, question) => {
    counts.set(question.topic, (counts.get(question.topic) || 0) + 1)
    return counts
  }, new Map())
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
        : topicSessionQuestions
  const activeQuizTitle = isReviewingWrongAnswers
    ? 'Wrong Answer Review'
    : practiceMode === 'final'
      ? 'Study Session'
      : practiceMode === 'marked'
        ? 'Marked Question Review'
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
        : topicSessionQuestions.length
  const totalAnswered = sessionResults.length
  const correctCount = sessionResults.filter((result) => result.isCorrect).length
  const wrongCount = wrongResults.length
  const scorePercent = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0
  const activeQuestions = questions.filter((item) => item.status === 'active').length
  const sourceDocuments = getUniqueReferenceValues(questions, 'sourceDocument')
  const referenceTopics = getUniqueReferenceValues(questions, 'topic')
  const selectedMemoryAircraftLabel = MEMORY_AIRCRAFT_LABELS[selectedMemoryAircraft]
  const applicableMemoryItems = MEMORY_ITEMS
    .filter((item) => isMemoryItemApplicableToAircraft(item, selectedMemoryAircraft))
    .map((item) => resolveMemoryItemForAircraft(item, selectedMemoryAircraft))
  const comparableMemoryItems = MEMORY_ITEMS.filter((item) => (
    isMemoryItemApplicableToAircraft(item, MEMORY_AIRCRAFT.NG) &&
    isMemoryItemApplicableToAircraft(item, MEMORY_AIRCRAFT.MAX)
  ))
  const activeCompareMemoryItem = comparableMemoryItems.find((item) => item.id === compareMemoryItemId) || comparableMemoryItems[0] || null
  const activeCompareMemoryItemId = activeCompareMemoryItem?.id || ''
  const memoryTopics = Array.from(new Set(applicableMemoryItems.map((item) => item.topic))).sort((first, second) =>
    first.localeCompare(second, undefined, { numeric: true }),
  )
  const memoryCategories = Array.from(new Set(applicableMemoryItems.map((item) => item.category))).sort((first, second) =>
    first.localeCompare(second, undefined, { numeric: true }),
  )
  const normalizedMemorySearch = memorySearch.trim().toLowerCase()
  const filteredMemoryItems = applicableMemoryItems.filter((item) => {
    const matchesTopic = !memoryTopicFilter || item.topic === memoryTopicFilter
    const matchesCategory = !memoryCategoryFilter || item.category === memoryCategoryFilter
    const matchesSearch = !normalizedMemorySearch || getMemoryItemSearchText(item).includes(normalizedMemorySearch)

    return matchesTopic && matchesCategory && matchesSearch
  })
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
  const parsedQuestionBankSearch = parseQuestionBankSearchQuery(questionBankSearch)
  const questionBankResults = questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => {
      const matchesTopic = !questionBankTopicFilter || question.topic === questionBankTopicFilter
      const matchesCorrectAnswer = !questionBankCorrectFilter || getCorrectAnswerKey(question) === questionBankCorrectFilter
      const matchesStatus = !questionBankActiveOnly || question.status === 'active'
      const matchesSearch = questionMatchesSearchQuery(question, parsedQuestionBankSearch)

      return matchesTopic && matchesCorrectAnswer && matchesStatus && matchesSearch
    })
    .sort((first, second) => compareQuestionIds(first.question, second.question) || first.index - second.index)
    .map(({ question }) => question)
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

  const startNewTopicSession = (topic = currentTopic) => {
    const randomizedQuestions = shuffleArray(questions.filter((item) => item.topic === topic))

    setPracticeMode('topic')
    setIsReviewingWrongAnswers(false)
    setIsSessionComplete(false)
    setSessionResults([])
    setFinalTestSessionQuestions([])
    setMarkedReviewQuestions([])
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

  const handleMemoryModeChange = (mode) => {
    setMemoryMode(mode)
  }

  const handleMemoryAircraftChange = (aircraft) => {
    setSelectedMemoryAircraft(aircraft)
    setMemoryTopicFilter('')
    setMemoryCategoryFilter('')
    setMemorySearch('')
  }

  const handleOpenMemoryItems = (topic = '') => {
    setMemoryTopicFilter(topic)
    setMemoryCategoryFilter('')
    setMemorySearch('')
    setView('memory-items')
  }

  const handleResetMemoryFilters = () => {
    setMemoryTopicFilter('')
    setMemoryCategoryFilter('')
    setMemorySearch('')
  }

  const renderMemoryDivider = (key) => (
    <div className="memory-divider-squares" aria-hidden="true" key={key}>
      <span />
      <span />
      <span />
      <span />
    </div>
  )

  const renderMemoryNote = (step, key) => (
    <li className="memory-note-list-item" key={key}>
      <div className="memory-note-block">
      {renderMemoryText(step.text, step)}
      </div>
    </li>
  )

  const renderMemoryLine = (line, className) => (
    <div className={className}>
      <span>{renderMemoryText(line.left, line)}</span>
      {line.right && (
        <>
          <span className="memory-separator">—</span>
          <strong>{formatMemoryResponse(line.right)}</strong>
        </>
      )}
    </div>
  )

  const renderMemorySteps = (item) => (
    <ol className="memory-step-list">
      {item.steps.map((step, stepIndex) => (
        step.type === 'note' ? renderMemoryNote(step, `${item.id}-note-${stepIndex}`) : (
          <li key={step.number}>
            {renderMemoryLine(step, 'memory-step-line')}
            {step.substeps?.length > 0 && (
              <div className="memory-substep-list">
                {step.substeps.map((substep, index) => (
                  <div key={`${step.number}-${index}-${substep.left}`}>
                    {renderMemoryLine(substep, 'memory-substep-line')}
                    {substep.dividerAfter && renderMemoryDivider(`${step.number}-${index}-divider`)}
                  </div>
                ))}
              </div>
            )}
            {step.dividerAfter && renderMemoryDivider(`${step.number}-divider`)}
          </li>
        )
      ))}
    </ol>
  )

  const hasStructuredConditionLines = (title, lines) => (
    title.toLowerCase() === 'condition' &&
    lines.length > 1 &&
    String(lines[0] || '').trim().endsWith(':')
  )

  const renderMemoryInfoLines = (title, lines, otherLines = null) => {
    const getLineClassName = (line, index) => (
      otherLines ? getCompareLineClassName(line, otherLines[index]) : undefined
    )

    if (hasStructuredConditionLines(title, lines)) {
      return (
        <div>
          <p className={getLineClassName(lines[0], 0)}>{lines[0]}</p>
          <ul className="memory-condition-list">
            {lines.slice(1).map((line, index) => (
              <li className={getLineClassName(line, index + 1)} key={`${title}-${line}-${index}`}>
                {line}
              </li>
            ))}
          </ul>
        </div>
      )
    }

    return (
      <div className={otherLines ? 'memory-compare-lines' : undefined}>
        {lines.map((line, index) => (
          <p className={getLineClassName(line, index)} key={`${title}-${index}`}>{line}</p>
        ))}
      </div>
    )
  }

  const renderMemoryInfoPanel = (title, lines, className, otherLines = null) => {
    if (!lines?.length) return null

    return (
      <section className={className}>
        <strong className="memory-info-label">{title}</strong>
        {renderMemoryInfoLines(title, lines, otherLines)}
      </section>
    )
  }

  const renderMemoryInfoPanels = (item, aircraft = selectedMemoryAircraft) => (
    <>
      {renderMemoryInfoPanel('Condition', getMemoryCompareLines(item, 'conditions', aircraft), 'memory-condition-panel')}
      {renderMemoryInfoPanel('Objective', getMemoryCompareLines(item, 'objectives', aircraft), 'memory-objective-panel')}
    </>
  )

  const renderMemoryVisualCues = (item) => {
    const visualCueGroups = item.visualCueGroups?.length
      ? item.visualCueGroups
      : item.visualCues?.length
        ? [{ label: '', cues: item.visualCues }]
        : []

    if (visualCueGroups.length === 0) return null

    return (
      <div className="memory-visual-cues" aria-label={`${item.title} visual cues`}>
        {visualCueGroups.map((group, groupIndex) => (
          <div className="memory-visual-cue-group" key={`${group.label || 'cue-group'}-${groupIndex}`}>
            {group.label && <span className="memory-visual-cue-group-label">{group.label}</span>}
            <div className="memory-visual-cue-group-items">
              {group.cues.map((cue, index) => (
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
          </div>
        ))}
      </div>
    )
  }

  const renderCompareCueGroups = (groups, otherGroups, title) => {
    if (!groups.length) return null

    return (
      <div className="memory-visual-cues" aria-label={`${title} visual cues`}>
        {groups.map((group, groupIndex) => {
          const labelDiffers = normalizeMemoryCompareLine(group.label) !== normalizeMemoryCompareLine(otherGroups[groupIndex]?.label)

          return (
            <div className="memory-visual-cue-group" key={`${group.label || 'cue-group'}-${groupIndex}`}>
              {group.label && (
                <span className={labelDiffers ? 'memory-visual-cue-group-label memory-diff-highlight' : 'memory-visual-cue-group-label'}>
                  {group.label}
                </span>
              )}
              <div className="memory-visual-cue-group-items">
                {group.cues.map((cue, index) => (
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
            </div>
          )
        })}
      </div>
    )
  }

  const renderMemoryTitle = (item) => {
    if (item.titleLayout === 'stacked-or') {
      return (
        <div className="memory-title-stack">
          <h3>{item.titlePrimary || item.title}</h3>
          <span>or</span>
          <h3>{item.titleSecondary}</h3>
          {item.titleTertiary && <h3>{item.titleTertiary}</h3>}
        </div>
      )
    }

    return (
      <>
        <h3>{item.title}</h3>
        {item.subtitle && <p>{item.subtitle}</p>}
      </>
    )
  }

  const getCompareLineClassName = (line, otherLine) => {
    if (!line) return 'memory-diff-line memory-diff-line-missing'
    return normalizeMemoryCompareLine(line) === normalizeMemoryCompareLine(otherLine)
      ? 'memory-diff-line'
      : 'memory-diff-line memory-diff-highlight'
  }

  const renderCompareChecklistLines = (lines, otherLines) => (
    <div className="memory-compare-lines">
      {lines.map((line, index) => (
        <div className={getCompareLineClassName(line, otherLines[index])} key={`${line}-${index}`}>
          {line}
        </div>
      ))}
    </div>
  )

  const renderCompareChecklistCard = (item, aircraft, otherAircraft, stepLines, otherStepLines) => {
    const conditionLines = getMemoryCompareLines(activeCompareMemoryItem, 'conditions', aircraft)
    const otherConditionLines = getMemoryCompareLines(activeCompareMemoryItem, 'conditions', otherAircraft)
    const objectiveLines = getMemoryCompareLines(activeCompareMemoryItem, 'objectives', aircraft)
    const otherObjectiveLines = getMemoryCompareLines(activeCompareMemoryItem, 'objectives', otherAircraft)
    const cueGroups = getMemoryCompareCueGroups(activeCompareMemoryItem, aircraft)
    const otherCueGroups = getMemoryCompareCueGroups(activeCompareMemoryItem, otherAircraft)

    return (
      <article className="memory-compare-card">
        <h3 className="memory-compare-column-title">{MEMORY_AIRCRAFT_LABELS[aircraft]}</h3>
        {renderMemoryTitle(item)}
        {renderCompareCueGroups(cueGroups, otherCueGroups, `${item.title} ${aircraft}`)}
        {renderMemoryInfoPanel('Condition', conditionLines, 'memory-condition-panel', otherConditionLines)}
        {renderMemoryInfoPanel('Objective', objectiveLines, 'memory-objective-panel', otherObjectiveLines)}
        <section className="memory-compare-section">
          <h4>Memory Items</h4>
          {renderCompareChecklistLines(stepLines, otherStepLines)}
        </section>
      </article>
    )
  }

  const renderMemoryCompareMode = () => {
    if (!activeCompareMemoryItem) {
      return (
        <article className="memory-item-card">
          <p className="memory-drill-empty">No Memory Items available for comparison.</p>
        </article>
      )
    }

    const ngItem = resolveMemoryItemForAircraft(activeCompareMemoryItem, MEMORY_AIRCRAFT.NG)
    const maxItem = resolveMemoryItemForAircraft(activeCompareMemoryItem, MEMORY_AIRCRAFT.MAX)
    const ngStepLines = flattenMemoryStepsForCompare(ngItem)
    const maxStepLines = flattenMemoryStepsForCompare(maxItem)
    const memoryItemsIdentical =
      ngStepLines.length === maxStepLines.length &&
      ngStepLines.every((line, index) => normalizeMemoryCompareLine(line) === normalizeMemoryCompareLine(maxStepLines[index]))

    return (
      <div className="memory-compare-page">
        <div className="section-header section-header-compact">
          <div>
            <p className="eyebrow">Memory Items</p>
            <h2>Compare NG / MAX</h2>
            <p className="subtitle">Compare 737-800 NG and 737-8 MAX memory item checklists.</p>
          </div>
        </div>
        <label className="field-label memory-compare-selector">
          Select checklist
          <select value={activeCompareMemoryItemId} onChange={(event) => setCompareMemoryItemId(event.target.value)}>
            {comparableMemoryItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.titleSecondary ? `${item.titlePrimary || item.title} or ${item.titleSecondary}` : item.title}
              </option>
            ))}
          </select>
        </label>

        {memoryItemsIdentical && <p className="memory-identical-badge">Memory items identical</p>}
        <div className="memory-compare-grid">
          {renderCompareChecklistCard(ngItem, MEMORY_AIRCRAFT.NG, MEMORY_AIRCRAFT.MAX, ngStepLines, maxStepLines)}
          {renderCompareChecklistCard(maxItem, MEMORY_AIRCRAFT.MAX, MEMORY_AIRCRAFT.NG, maxStepLines, ngStepLines)}
        </div>
      </div>
    )
  }

  const renderMemoryItemHeader = (item) => {
    return (
      <div className="memory-item-header">
        <div>
          {renderMemoryTitle(item)}
          <span className="memory-aircraft-badge">{selectedMemoryAircraftLabel}</span>
          <span className="memory-applicability-badge">{getMemoryAircraftBadgeLabel(item)}</span>
        </div>
      </div>
    )
  }

  const renderMemoryPracticeCard = (item) => (
    <article className="memory-item-card" key={`memory-${item.id}`}>
      {renderMemoryItemHeader(item)}
      {renderMemoryVisualCues(item)}
      {renderMemoryInfoPanels(item)}
      {renderMemorySteps(item)}
    </article>
  )

  const renderQuestionBankResultCard = (question) => {
    const correctAnswerKey = getCorrectAnswerKey(question)

    return (
      <article className="question-bank-card" key={`question-bank-${question.id}`}>
        <div className="question-bank-card-header">
          <span className="question-id">Question ID: {highlightSearchMatches(displayQuestionSourceId(question), questionBankSearch)}</span>
          <span>Topic: {highlightSearchMatches(question.topic, questionBankSearch)}</span>
        </div>

        <div className="question-bank-question">
          <span>Question:</span>
          <h3>{highlightSearchMatches(cleanQuestionText(question.question), questionBankSearch)}</h3>
        </div>

        <div className="question-bank-answers">
          {ANSWER_KEYS.map((key, index) => {
            const answerText = cleanAnswerText(question.answers?.[index] || '')
            const isCorrectAnswer = correctAnswerKey === key

            return (
              <div className={isCorrectAnswer ? 'question-bank-answer question-bank-answer-correct' : 'question-bank-answer'} key={`${question.id}-${key}`}>
                <span className="answer-key">{key}</span>
                <span className="answer-text">{highlightSearchMatches(answerText || '—', questionBankSearch)}</span>
              </div>
            )
          })}
        </div>

        <div className="question-bank-correct">
          Correct answer: <strong>{correctAnswerKey}</strong>
        </div>

        {(displayReferenceValue(question.manualReference) !== '—' || displayReferenceValue(question.sourceDocument) !== '—') && (
          <dl className="reference-meta question-bank-meta">
            {displayReferenceValue(question.manualReference) !== '—' && (
              <div>
                <dt>Manual reference</dt>
                <dd>{highlightSearchMatches(question.manualReference, questionBankSearch)}</dd>
              </div>
            )}
            {displayReferenceValue(question.sourceDocument) !== '—' && (
              <div>
                <dt>Source</dt>
                <dd>{highlightSearchMatches(question.sourceDocument, questionBankSearch)}</dd>
              </div>
            )}
          </dl>
        )}
      </article>
    )
  }

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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">B737 Study App</p>
          <h1>Study Questions</h1>
          <p className="subtitle">
            Practice the question bank with focused and randomized sessions.
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
            ['final-test', 'Study'],
            ['topics', 'Topics'],
            ['question-bank', 'Question Bank'],
            ['memory-items', 'Memory Items'],
            ['stats', 'Stats'],
          ].map(([targetView, label]) => (
            <button
              key={targetView}
              className={view === targetView || (targetView === 'final-test' && view === 'quiz' && practiceMode === 'final') ? 'sidebar-link sidebar-link-active' : 'sidebar-link'}
              onClick={() => setView(targetView)}
            >
              {label}
            </button>
          ))}
        </aside>

      <main className="app-main">
        {view === 'dashboard' && (
          <section className="dashboard-view">
            <div className="primary-actions-grid">
              <article className="action-card">
                <h3>Study</h3>
                <p>Randomized questions by full bank, aircraft systems, or selected topics.</p>
                <div className="card-actions">
                  <button
                    className="button button-primary"
                    onClick={() => setView('final-test')}
                    disabled={isLoading || questions.length === 0}
                  >
                    Start Study
                  </button>
                </div>
              </article>

              <article className="action-card">
                <h3>Practice by Topic</h3>
                <p>Choose a specific topic.</p>
                <div className="card-actions">
                  <button
                    className="button button-secondary"
                    onClick={() => setView('topics')}
                    disabled={isLoading}
                  >
                    Topics
                  </button>
                </div>
              </article>

              <article className="action-card">
                <h3>Question Bank</h3>
                <p>Search the full question database.</p>
                <div className="card-actions">
                  <button
                    className="button button-secondary"
                    onClick={() => setView('question-bank')}
                    disabled={isLoading || questions.length === 0}
                  >
                    Search Questions
                  </button>
                </div>
              </article>

              <article className="action-card memory-card memory-card-neutral">
                <h3 className="memory-title-critical">MEMORY ITEMS</h3>
                <span className="memory-aircraft-badge">{`${MEMORY_AIRCRAFT_LABELS[MEMORY_AIRCRAFT.NG]} / ${MEMORY_AIRCRAFT_LABELS[MEMORY_AIRCRAFT.MAX]}`}</span>
                <p>{MEMORY_ITEMS.length} checklists</p>
                <p>QRH recall items</p>
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

        {view === 'question-bank' && (
          <section className="question-bank-view">
            <div className="section-header">
              <div>
                <p className="eyebrow">Question Bank</p>
                <h2>Question Bank</h2>
                <p className="subtitle">Search all questions, answers, topics, and IDs.</p>
              </div>
              <button className="button button-ghost" onClick={handleBackToDashboard}>
                Back to dashboard
              </button>
            </div>

            <div className="question-bank-filters">
              <label className="field-label question-bank-search-field">
                Search
                <input
                  type="search"
                  value={questionBankSearch}
                  onChange={(event) => setQuestionBankSearch(event.target.value)}
                  placeholder="Search word or phrase..."
                />
              </label>
              <label className="field-label">
                Topic
                <select value={questionBankTopicFilter} onChange={(event) => setQuestionBankTopicFilter(event.target.value)}>
                  <option value="">All topics</option>
                  {topics.map((topic) => (
                    <option key={topic} value={topic}>
                      {topic}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Correct answer
                <select value={questionBankCorrectFilter} onChange={(event) => setQuestionBankCorrectFilter(event.target.value)}>
                  <option value="">All</option>
                  {ANSWER_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </label>
              <label className="question-bank-active-toggle">
                <input
                  type="checkbox"
                  checked={questionBankActiveOnly}
                  onChange={(event) => setQuestionBankActiveOnly(event.target.checked)}
                />
                <span>Active only</span>
              </label>
            </div>

            <div className="question-bank-summary">
              <span>{questions.length} questions</span>
              <strong>{questionBankResults.length} results</strong>
            </div>

            <div className="question-bank-results">
              {questionBankResults.length === 0 ? (
                <article className="question-bank-card">
                  <p className="memory-drill-empty">No questions match the current search.</p>
                </article>
              ) : (
                questionBankResults.map(renderQuestionBankResultCard)
              )}
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
                  <span className="memory-aircraft-badge">{selectedMemoryAircraftLabel}</span>
                  <span className="memory-critical-badge">CRITICAL RECALL ITEMS</span>
                </div>
                <p className="subtitle">QRH-style checklist reference for critical recall items.</p>
              </div>
              <button className="button button-ghost" onClick={handleBackToDashboard}>
                Back to dashboard
              </button>
            </div>

            <div className="memory-aircraft-selector">
              <span>Aircraft:</span>
              <div className="segmented-control">
                {MEMORY_AIRCRAFT_OPTIONS.map((aircraft) => (
                  <button
                    key={aircraft}
                    className={selectedMemoryAircraft === aircraft ? 'segmented-option segmented-option-active' : 'segmented-option'}
                    onClick={() => handleMemoryAircraftChange(aircraft)}
                  >
                    {MEMORY_AIRCRAFT_LABELS[aircraft]}
                  </button>
                ))}
              </div>
            </div>

            <div className="memory-mode-row">
              <div className="segmented-control">
                {[
                  [MEMORY_MODES.STUDY, 'Memory Items'],
                  [MEMORY_MODES.COMPARE, 'Compare NG / MAX'],
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
              Showing {filteredMemoryItems.length} of {applicableMemoryItems.length} {selectedMemoryAircraftLabel} memory items
            </div>

            {memoryMode === MEMORY_MODES.COMPARE ? (
              renderMemoryCompareMode()
            ) : (
              <div className="memory-item-list">
                {filteredMemoryItems.length === 0 ? (
                  <article className="memory-item-card">
                    <p className="memory-drill-empty">
                      {applicableMemoryItems.length === 0
                        ? 'No Memory Items available for this aircraft.'
                        : 'No Memory Items match the current filters.'}
                    </p>
                  </article>
                ) : (
                  filteredMemoryItems.map((item) => renderMemoryPracticeCard(item, memoryMode))
                )}
              </div>
            )}
          </section>
        )}

        {view === 'final-test' && (
          <section className="final-test-view">
            <article className="final-test-panel">
              <p className="eyebrow">Study</p>
              <h2>Study</h2>
              <p>Randomized question practice.</p>

              <div className="final-test-setup-grid">
                <div className="setup-group">
                  <span>Study scope</span>
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
                  <div className="final-topic-grid">
                    {topics.map((topic) => {
                      const isSelected = finalTestSelectedTopics.includes(topic)
                      const displayTopic = normalizeTopicDisplayName(topic)

                      return (
                        <label
                          className={isSelected ? 'final-topic-option is-selected' : 'final-topic-option'}
                          key={topic}
                        >
                          <input
                            type="checkbox"
                            className="final-topic-checkbox"
                            checked={isSelected}
                            onChange={() => handleFinalTestTopicToggle(topic)}
                          />
                          <span className="final-topic-option-body">
                            <span className="final-topic-option-title">{displayTopic}</span>
                            <span className="final-topic-option-count">{topicQuestionCounts.get(topic) || 0} questions</span>
                          </span>
                        </label>
                      )
                    })}
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
                  <dt>Study size</dt>
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
                <p className="setup-note">Select at least one topic to build this study session.</p>
              )}
              <div className="card-actions">
                <button
                  className="button button-primary"
                  onClick={handleStartFinalTest}
                  disabled={finalTestAvailableCount === 0}
                >
                  Start Study
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
                      ? 'Study session'
                      : practiceMode === 'marked'
                        ? 'Marked review'
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
                  {practiceMode === 'final'
                    ? 'Study Complete'
                    : practiceMode === 'marked'
                    ? 'Marked Review Complete'
                    : 'Session Complete'}
                </h3>
                <p>
                  {practiceMode === 'final'
                    ? `Study Session · ${activeFinalTestScopeLabel}`
                    : practiceMode === 'marked'
                      ? `${currentTopic} · Marked Review Complete`
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
                      ? 'Retry Study'
                      : practiceMode === 'marked'
                        ? 'Review Again'
                        : 'Retry Topic'}
                  </button>
                  {practiceMode !== 'final' && practiceMode !== 'marked' && (
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
