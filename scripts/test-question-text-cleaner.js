import assert from 'node:assert/strict'
import { cleanQuizText } from '../src/utils/questionTextCleaner.js'

const cases = [
  ['Upper Displa y Unit', 'Upper Display Unit'],
  ['condition s exist', 'conditions exist'],
  ['answer s are correct', 'answers are correct'],
  ['top left sid if each display', 'top left side of each display'],
]

cases.forEach(([input, expected]) => {
  assert.equal(cleanQuizText(input), expected)
})

console.log(`Question text cleaner passed ${cases.length} checks.`)
