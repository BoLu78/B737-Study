const AIRCRAFT_SYSTEM_TOPIC_TERMS = [
  'air system',
  'air conditioning',
  'anti-ice',
  'anti ice',
  'rain',
  'automatic flight',
  'flight controls',
  'electrical',
  'electrical power',
  'engines',
  'engine',
  'apu',
  'fuel',
  'hydraulics',
  'fire protection',
  'oxygen',
  'pneumatics',
  'pressurization',
  'landing gear',
  'brakes',
  'instruments',
  'navigation',
  'communications',
  'doors',
  'lights',
  'warning',
  'autoflight',
  'autopilot',
  'flight instruments',
]

const GENERIC_TOPIC_TERMS = [
  'aeroplane general',
  'limitations',
  'performance',
  'procedures',
]

export const FINAL_TEST_SCOPES = {
  ALL: 'all',
  AIRCRAFT_SYSTEMS: 'aircraft-systems',
  SELECTED_TOPICS: 'selected-topics',
}

export const FINAL_TEST_SCOPE_LABELS = {
  [FINAL_TEST_SCOPES.ALL]: 'All Questions',
  [FINAL_TEST_SCOPES.AIRCRAFT_SYSTEMS]: 'Aircraft Systems',
  [FINAL_TEST_SCOPES.SELECTED_TOPICS]: 'Selected Topics',
}

export const FINAL_TEST_COUNT_OPTIONS = [25, 50, 100]

export function shuffleArray(array) {
  const shuffled = [...array]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[randomIndex]
    shuffled[randomIndex] = current
  }

  return shuffled
}

function normalizeTopic(topic) {
  return String(topic || '').toLowerCase().replace(/[/_]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function isAircraftSystemsTopic(topic) {
  const normalizedTopic = normalizeTopic(topic)

  if (!normalizedTopic) return false

  const isSystemMatch = AIRCRAFT_SYSTEM_TOPIC_TERMS.some((term) => normalizedTopic.includes(term))
  const isGenericOnly = GENERIC_TOPIC_TERMS.some((term) => normalizedTopic === term || normalizedTopic.includes(term))

  return isSystemMatch && !isGenericOnly
}

export function getEligibleFinalTestQuestions(questions, scope = FINAL_TEST_SCOPES.ALL, selectedTopics = []) {
  const activeQuestions = Array.isArray(questions)
    ? questions.filter((question) => question?.status !== 'obsolete')
    : []

  if (scope === FINAL_TEST_SCOPES.AIRCRAFT_SYSTEMS) {
    const systemQuestions = activeQuestions.filter((question) => isAircraftSystemsTopic(question.topic))
    return systemQuestions.length > 0 ? systemQuestions : activeQuestions
  }

  if (scope === FINAL_TEST_SCOPES.SELECTED_TOPICS) {
    const selectedTopicSet = new Set(selectedTopics)
    return activeQuestions.filter((question) => selectedTopicSet.has(question.topic))
  }

  return activeQuestions
}

export function selectFinalTestQuestions({
  questions,
  scope = FINAL_TEST_SCOPES.ALL,
  selectedTopics = [],
  requestedCount = 100,
}) {
  const safeRequestedCount = Number.isInteger(Number(requestedCount))
    ? Math.max(1, Number(requestedCount))
    : 100
  const eligibleQuestions = getEligibleFinalTestQuestions(questions, scope, selectedTopics)
  const shuffledQuestions = shuffleArray(eligibleQuestions)

  return shuffledQuestions.slice(0, Math.min(safeRequestedCount, shuffledQuestions.length))
}
