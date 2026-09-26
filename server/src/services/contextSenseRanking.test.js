import assert from 'node:assert/strict'
import test from 'node:test'
import { rankContextualSenses } from './contextSenseRanking.js'

const cases = [
  {
    sentence: 'He went to the bank to deposit his salary.',
    word: 'bank',
    expected: 'financial',
    candidates: [
      { definition: 'The land beside a river.', part_of_speech: 'noun' },
      { definition: 'A financial institution that accepts money and deposits.', part_of_speech: 'noun' },
    ],
  },
  {
    sentence: 'They sat on the river bank and watched the water.',
    word: 'bank',
    expected: 'river',
    candidates: [
      { definition: 'A financial institution that accepts deposits.', part_of_speech: 'noun' },
      { definition: 'The land beside a river or other body of water.', part_of_speech: 'noun' },
    ],
  },
  {
    sentence: 'The mouse stopped working, so I bought a new one.',
    word: 'mouse',
    expected: 'computer',
    candidates: [
      { definition: 'A small rodent with a pointed snout.', part_of_speech: 'noun' },
      { definition: 'A small computer input device used to control a cursor.', part_of_speech: 'noun' },
    ],
  },
  {
    sentence: 'A mouse ran across the kitchen floor.',
    word: 'mouse',
    expected: 'rodent',
    candidates: [
      { definition: 'A computer input device.', part_of_speech: 'noun' },
      { definition: 'A small rodent or animal with a pointed snout.', part_of_speech: 'noun' },
    ],
  },
  {
    sentence: 'She runs a successful software company.',
    word: 'runs',
    normalizedWord: 'run',
    expected: 'manage',
    candidates: [
      { definition: 'Move quickly on foot.', part_of_speech: 'verb' },
      { definition: 'Manage or operate a business or company.', part_of_speech: 'verb' },
    ],
  },
  {
    sentence: 'She runs every morning before work.',
    word: 'runs',
    normalizedWord: 'run',
    expected: 'foot',
    candidates: [
      { definition: 'Cause to move quickly or lightly.', example: 'Every day I run my dog.', part_of_speech: 'verb' },
      { definition: 'Manage or operate a company.', part_of_speech: 'verb' },
      { definition: 'Move quickly on foot as exercise.', part_of_speech: 'verb' },
    ],
  },
]

for (const testCase of cases) {
  test(`selects the contextual sense for: ${testCase.sentence}`, () => {
    const result = rankContextualSenses({
      candidates: testCase.candidates,
      normalizedWord: testCase.normalizedWord || testCase.word,
      sentence: testCase.sentence,
      word: testCase.word,
    })

    assert.match(result.ranked[0].definition, new RegExp(testCase.expected, 'i'))
  })
}

test('marks close context scores as ambiguous', () => {
  const result = rankContextualSenses({
    candidates: [
      { definition: 'A place used for a particular purpose.', part_of_speech: 'noun' },
      { definition: 'An area used for a particular activity.', part_of_speech: 'noun' },
    ],
    normalizedWord: 'place',
    sentence: 'They found the place.',
    word: 'place',
  })

  assert.equal(result.ambiguous, true)
  assert.equal(result.confidence, 'low')
})
