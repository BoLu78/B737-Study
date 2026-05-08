import { useState, useEffect, useCallback } from 'react'
import './App.css'
import {
  countManualChunks,
  createSignedManualUrl,
  getCurrentSession,
  isSupabaseConfigured,
  loadManualChunksSearch,
  loadManualDocuments,
  loadQuestionsFromSupabase,
  onAuthStateChange,
  signInWithEmailPassword,
  signOut,
} from './lib/supabaseClient'
import { getCanonicalTopic } from './utils/topicNormalizer'

const APP_VERSION = 'v7.0'
const FINAL_TEST_QUESTION_LIMIT = 100
const PLANNED_MANUAL_TYPES = ['FCOM', 'FCTM', 'QRH', 'MEL', 'OM-B', 'CBT / Training Notes', 'T73 Question Bank']
const DATA_SOURCE_SUPABASE = 'Supabase'
const DATA_SOURCE_FALLBACK = 'Local fallback'
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

const RAW_FALLBACK_QUESTIONS = [
  {
    id: 'AS-01',
    topic: 'Air System',
    question: 'Which component regulates cabin pressure by modulating outflow air?',
    answers: ['Outflow valve', 'Pack heat exchanger', 'Ram air inlet', 'Recirculation fan'],
    correctAnswer: 0,
    explanation:
      'The outflow valve controls cabin pressure by releasing bleed air from the cabin at a controlled rate.',
    status: 'active',
  },
  {
    id: 'FC-02',
    topic: 'Flight Controls',
    question: 'What is the primary function of the trailing edge flaps during takeoff?',
    answers: ['Increase lift', 'Reduce drag', 'Stabilize yaw', 'Lock spoilers'],
    correctAnswer: 0,
    explanation:
      'Trailing edge flaps increase wing camber and lift at lower speeds during takeoff and landing.',
    status: 'active',
  },
  {
    id: 'FU-03',
    topic: 'Fuel',
    question: 'Which tank is typically used first on the B737 to maintain aircraft balance?',
    answers: ['Center tank', 'Left main tank', 'Right main tank', 'Auxiliary tank'],
    correctAnswer: 0,
    explanation:
      'The center tank is normally drained first to maintain an optimal lateral balance and CG.',
    status: 'active',
  },
  {
    id: 'HY-04',
    topic: 'Hydraulics',
    question: 'How many hydraulic systems provide primary flight control power on the B737?',
    answers: ['Two', 'Three', 'One', 'Four'],
    correctAnswer: 1,
    explanation:
      'The B737 uses three hydraulic systems (A, B, and standby) for primary flight control power.',
    status: 'active',
  },
  {
    id: 'LM-05',
    topic: 'Limitations',
    question: 'Which limit must be observed for maximum landing weight?',
    answers: ['Structural limit', 'Cabin pressure limit', 'Engine oil limit', 'Flap speed limit'],
    correctAnswer: 0,
    explanation:
      'Maximum landing weight is a structural limitation to ensure the airframe is within certified landing loads.',
    status: 'active',
  },
  {
    id: 'ET-06',
    topic: 'Long Haul / ETOPS',
    question: 'ETOPS planning is most critical for flights that operate beyond what point?',
    answers: ['60 minutes from diversion airport', '70 feet AGL', 'Below FL200', 'During taxi'],
    correctAnswer: 0,
    explanation:
      'ETOPS rules apply when the aircraft is beyond the maximum diversion time to a suitable alternate airport.',
    status: 'active',
  },
]

const FALLBACK_QUESTIONS = RAW_FALLBACK_QUESTIONS.map((question) => ({
  ...question,
  rawTopic: question.topic,
  topic: getCanonicalTopic(question.topic),
}))

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
    return 'Source ID must be a whole number.'
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
  const answers = Array.isArray(question?.answers) ? question.answers : []

  return ANSWER_KEYS.map((key, originalIndex) => {
    const answer = answers[originalIndex]
    const text = typeof answer === 'string' ? answer.replace(/\s+/g, ' ').trim() : ''

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

function App() {
  const [questions, setQuestions] = useState(FALLBACK_QUESTIONS)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [dataSource, setDataSource] = useState(DATA_SOURCE_FALLBACK)
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
  const [markedForReview, setMarkedForReview] = useState(() => new Set())
  const [adminForm, setAdminForm] = useState(null)
  const [adminMode, setAdminMode] = useState(null)
  const [adminFormError, setAdminFormError] = useState('')
  const [adminPreview, setAdminPreview] = useState(null)
  const [referenceSourceFilter, setReferenceSourceFilter] = useState('')
  const [referenceTopicFilter, setReferenceTopicFilter] = useState('')
  const [referenceSearch, setReferenceSearch] = useState('')
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

  const applyDatabaseResult = useCallback((data, error) => {
    if (error || !data) {
      setQuestions(FALLBACK_QUESTIONS)
      setDataSource(DATA_SOURCE_FALLBACK)
      setLoadError(error || 'Unable to load questions from Supabase.')
      setIsLoading(false)
      return
    }

    setQuestions(data)
    setDataSource(DATA_SOURCE_SUPABASE)
    setIsLoading(false)
  }, [])

  const loadQuestionDatabase = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)

    const { data, error } = await loadQuestionsFromSupabase()
    applyDatabaseResult(data, error)
  }, [applyDatabaseResult])

  useEffect(() => {
    let isMounted = true

    const loadInitialData = async () => {
      const [{ data, error }, manualResult] = await Promise.all([
        loadQuestionsFromSupabase(),
        loadManualDocuments(),
      ])

      if (isMounted) {
        applyDatabaseResult(data, error)
        setManualDocuments(manualResult.data || [])
        setIsManualCatalogLoading(false)
      }
    }

    loadInitialData()

    return () => {
      isMounted = false
    }
  }, [applyDatabaseResult])

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
  const currentTopic = topics.includes(selectedTopic) ? selectedTopic : topics[0] || ''
  const topicQuestions = questions.filter((item) => item.topic === currentTopic)
  const finalTestQuestions = questions.slice(0, Math.min(FINAL_TEST_QUESTION_LIMIT, questions.length))
  const wrongResults = sessionResults.filter((result) => !result.isCorrect)
  const activeQuizQuestions = isReviewingWrongAnswers
    ? wrongResults.map((result) => result.question)
    : practiceMode === 'final'
      ? finalTestQuestions
      : topicQuestions
  const activeQuizTitle = isReviewingWrongAnswers
    ? 'Wrong Answer Review'
    : practiceMode === 'final'
      ? 'Final Test Simulation'
      : currentTopic
  const currentQuestion = activeQuizQuestions[questionIndex]
  const currentReviewResult = isReviewingWrongAnswers ? wrongResults[questionIndex] : null
  const currentAnswerOptions = normalizeQuizOptions(currentQuestion)
  const completedCount = activeQuizQuestions.length
  const normalSessionTotal = practiceMode === 'final' ? finalTestQuestions.length : topicQuestions.length
  const totalAnswered = sessionResults.length
  const correctCount = sessionResults.filter((result) => result.isCorrect).length
  const wrongCount = wrongResults.length
  const scorePercent = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0
  const activeQuestions = questions.filter((item) => item.status === 'active').length
  const sourceDocuments = getUniqueReferenceValues(questions, 'sourceDocument')
  const referenceTopics = getUniqueReferenceValues(questions, 'topic')
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
  const dashboardTopics = topics.slice(0, 8)
  const studiedToday = '—'
  const accuracyLabel = '—'
  const weakTopicsLabel = '—'
  const progressPercent = isSessionComplete
    ? 100
    : completedCount > 0
      ? Math.round(((questionIndex + (answered || isReviewingWrongAnswers ? 1 : 0)) / completedCount) * 100)
      : 0

  const handleRefreshDatabase = async () => {
    await loadQuestionDatabase()
  }

  const handleStartQuiz = (topic = currentTopic) => {
    setPracticeMode('topic')
    setIsReviewingWrongAnswers(false)
    setIsSessionComplete(false)
    setSessionResults([])
    setSelectedTopic(topic)
    setQuestionIndex(0)
    setAnswered(false)
    setSelectedAnswer(null)
    setCorrect(false)
    setView('quiz')
  }

  const handleContinueStudy = () => {
    setPracticeMode('topic')
    setIsReviewingWrongAnswers(false)
    setView('quiz')
  }

  const handleStartFinalTest = () => {
    setPracticeMode('final')
    setIsReviewingWrongAnswers(false)
    setIsSessionComplete(false)
    setSessionResults([])
    setQuestionIndex(0)
    setAnswered(false)
    setSelectedAnswer(null)
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

  const handleNextQuestion = () => {
    if (questionIndex + 1 >= activeQuizQuestions.length) {
      if (isReviewingWrongAnswers) {
        setIsReviewingWrongAnswers(false)
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

  const handleRetryTopic = () => {
    setIsReviewingWrongAnswers(false)
    setIsSessionComplete(false)
    setSessionResults([])
    setQuestionIndex(0)
    setSelectedAnswer(null)
    setAnswered(false)
    setCorrect(false)
    setView('quiz')
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

  const handleToggleMarkForReview = () => {
    if (!currentQuestion) return

    setMarkedForReview((current) => {
      const next = new Set(current)

      if (next.has(currentQuestion.id)) {
        next.delete(currentQuestion.id)
      } else {
        next.add(currentQuestion.id)
      }

      return next
    })
  }

  const handleResetReferenceFilters = () => {
    setReferenceSourceFilter('')
    setReferenceTopicFilter('')
    setReferenceSearch('')
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

  const handleOpenAdmin = () => {
    setView('admin')
    setAdminForm(null)
    setAdminMode(null)
    setAdminFormError('')
    setAdminPreview(null)
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
              {isSupabaseConfigured ? 'Database connection warning — fallback active' : 'Supabase not configured — local fallback active'}
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

      <div className="app-layout">
        <aside className="sidebar-nav" aria-label="Primary navigation">
          {[
            ['dashboard', 'Dashboard'],
            ['quiz', 'Study'],
            ['topics', 'Topics'],
            ['stats', 'Stats'],
            ['final-test', 'Final Test'],
            ['settings', 'Settings'],
          ].map(([targetView, label]) => (
            <button
              key={targetView}
              className={view === targetView || (targetView === 'quiz' && view === 'quiz') ? 'sidebar-link sidebar-link-active' : 'sidebar-link'}
              onClick={() => {
                if (targetView === 'quiz') {
                  handleContinueStudy()
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
                    disabled={isLoading || completedCount === 0}
                  >
                    Continue
                  </button>
                </div>
              </article>

              <article className="action-card">
                <h3>Practice by Topic</h3>
                <p>Choose a topic.</p>
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
                <h3>Final Test</h3>
                <p>{finalTestQuestions.length} questions.</p>
                <div className="card-actions">
                  <button
                    className="button button-primary"
                    onClick={handleStartFinalTest}
                    disabled={isLoading || finalTestQuestions.length === 0}
                  >
                    Start Final Test
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
            </div>

            <section className="dashboard-topics-section">
              <div className="section-header section-header-compact">
                <div>
                  <p className="eyebrow">Topics</p>
                  <h2>Practice areas</h2>
                </div>
                <button className="button button-ghost" onClick={() => setView('topics')}>
                  View All Topics
                </button>
              </div>
              <div className="topic-grid">
                {dashboardTopics.map((topic) => {
                  const count = questions.filter((item) => item.topic === topic).length
                  return (
                    <article className="topic-card" key={topic}>
                      <h3>{topic}</h3>
                      <p>{count} questions</p>
                      <button className="button button-secondary" onClick={() => handleStartQuiz(topic)}>
                        Practice
                      </button>
                    </article>
                  )
                })}
              </div>
            </section>

            <section className="dashboard-secondary-panel">
              <div>
                <div className="support-title-row">
                  <h3>Manual Reference</h3>
                  <span>Support</span>
                </div>
                <p>Use manuals only when you need a reference.</p>
              </div>
              <div className="secondary-actions">
                <button className="button button-secondary" onClick={() => setView('manual-references')}>
                  Open Manuals
                </button>
                <button className="button button-ghost" onClick={() => setView('database')}>
                  Browse Question Database
                </button>
                <button className="button button-ghost" onClick={() => setView('stats')}>
                  View Statistics
                </button>
                <button className="button button-ghost" onClick={handleRefreshDatabase}>
                  Refresh Database
                </button>
              </div>
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
                return (
                  <article className="topic-card" key={topic}>
                    <h3>{topic}</h3>
                    <p>{count} questions</p>
                    <button className="button button-secondary" onClick={() => handleStartQuiz(topic)}>
                      Start practice
                    </button>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {view === 'final-test' && (
          <section className="final-test-view">
            <article className="final-test-panel">
              <p className="eyebrow">Final Test</p>
              <h2>Final Test Simulation</h2>
              <p>
                Run an exam-style practice session using the loaded question bank. Keep manuals as support after the session, not during the first pass.
              </p>
              <dl className="reference-meta">
                <div>
                  <dt>Questions</dt>
                  <dd>{finalTestQuestions.length}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{dataSource}</dd>
                </div>
                <div>
                  <dt>Mode</dt>
                  <dd>Focused session</dd>
                </div>
              </dl>
              <div className="card-actions">
                <button className="button button-primary" onClick={handleStartFinalTest}>
                  Start Final Test
                </button>
                <button className="button button-ghost" onClick={handleBackToDashboard}>
                  Back to dashboard
                </button>
              </div>
            </article>
          </section>
        )}

        {view === 'settings' && (
          <section className="settings-view">
            <div className="section-header">
              <div>
                <p className="eyebrow">Settings</p>
                <h2>Study App Settings</h2>
                <p className="subtitle">Operational status for the local study workflow.</p>
              </div>
              <button className="button button-ghost" onClick={handleBackToDashboard}>
                Back to dashboard
              </button>
            </div>
            <div className="settings-grid">
              <article className="stat-card">
                <span>Data source</span>
                <strong>{dataSource}</strong>
              </article>
              <article className="stat-card">
                <span>Manual AI</span>
                <strong>Disabled</strong>
              </article>
              <article className="stat-card">
                <span>Manual chunks</span>
                <strong>{manualChunksCount !== null ? manualChunksCount.toLocaleString() : 'Checking'}</strong>
              </article>
              <article className="stat-card">
                <span>Version</span>
                <strong>{APP_VERSION}</strong>
              </article>
              <article className="stat-card">
                <span>Admin</span>
                <button className="button button-secondary" onClick={handleOpenAdmin}>
                  Open Admin
                </button>
              </article>
            </div>
          </section>
        )}

        {view === 'quiz' && (
          <section className="quiz-view">
            <div className="practice-topbar">
              <div>
                <p className="eyebrow">
                  {isReviewingWrongAnswers ? 'Review' : practiceMode === 'final' ? 'Final test simulation' : 'Topic practice'}
                </p>
                <h2>{activeQuizTitle}</h2>
                <p className="subtitle">
                  {isSessionComplete ? 'Results' : `Question ${questionIndex + 1} of ${completedCount}`}
                </p>
              </div>
              <div className="practice-progress">
                <div className="progress-track">
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
                <span>{progressPercent}%</span>
              </div>
              <button className="button button-ghost" onClick={handleBackToDashboard}>
                Exit practice
              </button>
            </div>

            {isSessionComplete ? (
              <article className="question-card session-complete-card">
                <p className="eyebrow">Session Complete</p>
                <h3>Session Complete</h3>
                <p>{practiceMode === 'final' ? 'Final Test Simulation' : currentTopic}</p>
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
                  <button className="button button-secondary" onClick={handleRetryTopic}>
                    Retry Topic
                  </button>
                  <button className="button button-ghost" onClick={() => setView('topics')}>
                    Choose Another Topic
                  </button>
                  <button className="button button-ghost" onClick={handleBackToDashboard}>
                    Back to Dashboard
                  </button>
                </div>
              </article>
            ) : currentQuestion ? (
              <div className="practice-layout">
                <article className="question-card practice-question-card">
                  <p className="question-id">{currentQuestion.id}</p>
                  <h3>{currentQuestion.question}</h3>
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
                      <strong>Previous answer: {currentReviewResult.selectedAnswerKey} — {currentReviewResult.selectedAnswerText}</strong>
                      <span>Correct answer: {currentReviewResult.correctAnswerKey} — {currentReviewResult.correctAnswerText}</span>
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
                          {markedForReview.has(currentQuestion.id) ? 'Marked for Review' : 'Mark for Review'}
                        </button>
                      </>
                    )}
                  </div>
                </article>

                <aside className="practice-aids">
                  <div>
                    <p className="eyebrow">Study aids</p>
                    <h3>Progress</h3>
                    <p>{questionIndex + 1} of {completedCount} questions</p>
                  </div>
                  <div className="practice-aid-stat">
                    <span>Review marks</span>
                    <strong>{markedForReview.size}</strong>
                  </div>
                  <button className="button button-secondary" onClick={() => setView('manual-references')}>
                    Open Manual Support
                  </button>
                  <p className="question-meta">
                    {hasManualChunks
                      ? 'Raw manual chunk search is available as secondary support.'
                      : 'Manual index not ready yet.'}
                  </p>
                </aside>
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
                    <th>ID</th>
                    <th>Source ID</th>
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
                      <td>{item.id}</td>
                      <td>{displayReferenceValue(item.sourceId)}</td>
                      <td>{item.topic}</td>
                      <td>{item.question}</td>
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
                    <span className="question-id">Source ID {displayReferenceValue(item.sourceId)}</span>
                    <span>{displayReferenceValue(item.topic)}</span>
                  </div>
                  <h3>{item.question}</h3>
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
                    Source ID
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
                    <span className="question-id">{item.id}</span>
                    <h3>{item.question}</h3>
                    <dl className="admin-question-meta">
                      <div>
                        <dt>Source ID</dt>
                        <dd>{item.sourceId || '—'}</dd>
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
            </div>
          </section>
        )}
      </main>
      </div>

      <footer className="app-footer">
        Online-first study cockpit with Supabase question sync.
      </footer>
    </div>
  )
}

export default App
