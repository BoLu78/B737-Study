import assert from 'node:assert/strict'
import { cleanQuizText } from '../src/utils/questionTextCleaner.js'

const changedCases = [
  ['Lock th e mask in their stowage boxes', 'Lock the mask in their stowage boxes'],
  [
    'From an exterior panel located on the aft bottom ri g ht side of the aft fuselage',
    'From an exterior panel located on the aft bottom right side of the aft fuselage',
  ],
  [
    'On the flight deck, where is the flight crew oxygen pressure d isplayed?',
    'On the flight deck, where is the flight crew oxygen pressure displayed?',
  ],
  ['At the flight crew oxygen shutof f valve', 'At the flight crew oxygen shutoff valve'],
  ['Upper Displa y Unit', 'Upper Display Unit'],
  ['condition s exist', 'conditions exist'],
  ['All the answer s are correct', 'All the answers are correct'],
  ['top left sid if each display', 'top left side of each display'],
]

const unchangedCases = [
  'APU',
  'EICAS',
  'ENG ANTI-ICE',
  'TAI',
  'QRH',
  'FCOM',
  'P18 panel',
  '737-800',
]

changedCases.forEach(([input, expected]) => {
  assert.equal(cleanQuizText(input), expected)
})

unchangedCases.forEach((input) => {
  assert.equal(cleanQuizText(input), input)
})

console.log(`Question text cleaner passed ${changedCases.length + unchangedCases.length} checks.`)
