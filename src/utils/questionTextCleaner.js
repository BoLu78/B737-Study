import { QUESTION_TEXT_CORRECTIONS } from './questionTextCorrections.js'

const WORD_SPACING_CORRECTIONS = [
  [/\bDispla y\b/g, 'Display'],
  [/\bdispla y\b/g, 'display'],
  [/\bcondition s\b/g, 'conditions'],
  [/\bCondition s\b/g, 'Conditions'],
  [/\banswer s\b/g, 'answers'],
  [/\bAnswer s\b/g, 'Answers'],
  [/\bsystem s\b/g, 'systems'],
  [/\bSystem s\b/g, 'Systems'],
  [/\bswitch es\b/g, 'switches'],
  [/\bSwitch es\b/g, 'Switches'],
  [/\bvalve s\b/g, 'valves'],
  [/\bValve s\b/g, 'Valves'],
  [/\bdisplay s\b/g, 'displays'],
  [/\bDisplay s\b/g, 'Displays'],
]

function applyLiteralCorrections(text) {
  return QUESTION_TEXT_CORRECTIONS.reduce(
    (cleanedText, [original, replacement]) => cleanedText.replaceAll(original, replacement),
    text,
  )
}

export function cleanQuizText(text) {
  if (text === null || text === undefined) return ''

  let cleanedText = String(text)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')

  cleanedText = applyLiteralCorrections(cleanedText)

  WORD_SPACING_CORRECTIONS.forEach(([pattern, replacement]) => {
    cleanedText = cleanedText.replace(pattern, replacement)
  })

  cleanedText = cleanedText
    .replace(/\b(side)\s+if\s+each\s+display\b/gi, '$1 of each display')
    .replace(/\s+([,;:?!])/g, '$1')
    .replace(/\s+\.(?!\d)/g, '.')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()

  return cleanedText
}

export function cleanQuestionText(text) {
  return cleanQuizText(text)
}

export function cleanAnswerText(text) {
  return cleanQuizText(text)
}
