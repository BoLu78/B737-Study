import b737QuestionBank from '../../data/generated/questions.json'
import b787QuestionBank from '../../data/aircraft/b787/generated/questions.json'
import { getCanonicalTopic } from '../utils/topicNormalizer'
import { MEMORY_ITEMS } from './memoryItems'

const ANSWER_KEYS = ['A', 'B', 'C', 'D']

function normalizeQuestionBank(questionBank, options = {}) {
  return questionBank.map((question) => {
    const correctAnswerLetter = String(question.correct || '').trim().toUpperCase()
    const correctAnswerIndex = ANSWER_KEYS.indexOf(correctAnswerLetter)
    const answers = ANSWER_KEYS.map((key) => question.options?.find((option) => option.key === key)?.text || '')
    const topic = options.canonicalizeTopic ? getCanonicalTopic(question.topic) : String(question.topic || 'Uncategorized').trim()

    return {
      id: question.id,
      sourceId: question.id,
      rawTopic: question.topic,
      topic: topic || 'Uncategorized',
      subtopic: null,
      question: question.question,
      answers,
      options: question.options || [],
      correctAnswer: correctAnswerIndex >= 0 ? correctAnswerIndex : 0,
      correctAnswerLetter,
      explanation: '',
      manualReference: null,
      sourceDocument: options.sourceDocument,
      sourcePage: null,
      status: 'active',
      difficulty: null,
    }
  })
}

export const AIRCRAFT_IDS = {
  B737: 'b737',
  B787: 'b787',
}

export const AIRCRAFT_CONFIGS = {
  [AIRCRAFT_IDS.B737]: {
    id: AIRCRAFT_IDS.B737,
    label: 'B737 NG / MAX',
    shortLabel: 'B737',
    subtitle: 'B737 NG/MAX study module',
    themeClass: 'theme-b737',
    questionBankSource: 'T73 R01 Excel question bank',
    questions: normalizeQuestionBank(b737QuestionBank, {
      canonicalizeTopic: true,
      sourceDocument: 'T73 R01 Excel question bank',
    }),
    memoryItems: MEMORY_ITEMS,
    memoryItemsAvailable: true,
    supportsAircraftSystemsScope: true,
  },
  [AIRCRAFT_IDS.B787]: {
    id: AIRCRAFT_IDS.B787,
    label: 'B787',
    shortLabel: 'B787',
    subtitle: 'B787 study module',
    themeClass: 'theme-b787',
    questionBankSource: 'T78 R03 Excel question bank',
    questions: normalizeQuestionBank(b787QuestionBank, {
      canonicalizeTopic: false,
      sourceDocument: 'T78 R03 Excel question bank',
    }),
    memoryItems: [],
    memoryItemsAvailable: false,
    supportsAircraftSystemsScope: false,
  },
}

export const AIRCRAFT_OPTIONS = [AIRCRAFT_CONFIGS[AIRCRAFT_IDS.B737], AIRCRAFT_CONFIGS[AIRCRAFT_IDS.B787]]

export function getAircraftConfig(aircraftId) {
  return AIRCRAFT_CONFIGS[aircraftId] || null
}
