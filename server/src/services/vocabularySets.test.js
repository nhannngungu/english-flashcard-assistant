import assert from 'node:assert/strict'
import test from 'node:test'
import {
  defaultVocabularySetTitle,
  getVocabularySetPage,
  vocabularySetPageSize,
} from './vocabularySets.js'

test('default set title uses the user local calendar date', () => {
  const lateUtcTime = new Date('2026-09-26T18:30:00.000Z')
  assert.equal(defaultVocabularySetTitle(lateUtcTime, -420), 'Vocabulary Set - 27/09/2026')
  assert.equal(defaultVocabularySetTitle(lateUtcTime, 0), 'Vocabulary Set - 26/09/2026')
})

test('review set pagination is fixed at six and invalid pages fall back to one', () => {
  assert.equal(vocabularySetPageSize, 6)
  assert.equal(getVocabularySetPage('3'), 3)
  assert.equal(getVocabularySetPage('0'), 1)
  assert.equal(getVocabularySetPage('invalid'), 1)
})
