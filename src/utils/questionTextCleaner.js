import {
  QUESTION_TEXT_PHRASE_CORRECTIONS,
  QUESTION_TEXT_SPLIT_WORD_DICTIONARY,
} from './questionTextCorrections.js'

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function applyCapitalization(originalText, replacement) {
  if (originalText === originalText.toUpperCase() && /[A-Z]/.test(originalText)) {
    return replacement.toUpperCase()
  }

  if (/^[A-Z]/.test(originalText)) {
    return `${replacement.charAt(0).toUpperCase()}${replacement.slice(1)}`
  }

  return replacement
}

function generateSplitVariants(word) {
  if (!/^[a-z]+$/.test(word)) return []

  const variants = new Set()

  for (let splitIndex = 1; splitIndex < word.length; splitIndex += 1) {
    variants.add(`${word.slice(0, splitIndex)} ${word.slice(splitIndex)}`)
  }

  for (let letterIndex = 1; letterIndex < word.length - 1; letterIndex += 1) {
    variants.add(`${word.slice(0, letterIndex)} ${word.charAt(letterIndex)} ${word.slice(letterIndex + 1)}`)
  }

  return Array.from(variants)
}

const SPLIT_VARIANT_CORRECTIONS = QUESTION_TEXT_SPLIT_WORD_DICTIONARY
  .flatMap((word) => {
    const normalizedWord = String(word).trim()
    const lowerWord = normalizedWord.toLowerCase()

    if (!/^[a-z]+$/.test(lowerWord)) return []

    return generateSplitVariants(lowerWord).map((variant) => ({
      variant,
      replacement: lowerWord,
    }))
  })
  .sort((first, second) => second.variant.length - first.variant.length)

function applyPhraseCorrections(text) {
  return QUESTION_TEXT_PHRASE_CORRECTIONS.reduce((cleanedText, [original, replacement]) => {
    const pattern = new RegExp(escapeRegExp(original), 'gi')
    return cleanedText.replace(pattern, (match) => applyCapitalization(match, replacement))
  }, text)
}

function applySplitWordCorrections(text) {
  return SPLIT_VARIANT_CORRECTIONS.reduce((cleanedText, { variant, replacement }) => {
    const pattern = new RegExp(`\\b${escapeRegExp(variant)}\\b`, 'gi')
    return cleanedText.replace(pattern, (match) => applyCapitalization(match, replacement))
  }, text)
}

function normalizeSpacing(text) {
  return text
    .replace(/\s+([,;:?!])/g, '$1')
    .replace(/\s+\.(?!\d)/g, '.')
    .replace(/([,;:?!])(?=\S)/g, '$1 ')
    .replace(/\.([A-Za-z])/g, '. $1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

export function cleanQuizText(text) {
  if (text === null || text === undefined) return ''

  const normalizedText = String(text)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')

  return normalizeSpacing(applySplitWordCorrections(applyPhraseCorrections(normalizedText)))
}

export function cleanQuestionText(text) {
  return cleanQuizText(text)
}

export function cleanAnswerText(text) {
  return cleanQuizText(text)
}
