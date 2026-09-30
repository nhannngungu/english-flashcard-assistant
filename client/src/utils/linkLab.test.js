import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateAccuracy, createRounds, eligibleWords, formatElapsed, shuffle } from './linkLab.js'

const words = Array.from({ length: 18 }, (_, index) => ({
  id: index + 1,
  word: `word-${index + 1}`,
  meaning_vi: `meaning-${index + 1}`,
  example: `Example ${index + 1}`,
  image_url: index < 8 ? `https://images.example/${index + 1}.jpg` : '',
}))

test('classic mode creates a six-pair round', () => {
  const [round] = createRounds(eligibleWords(words.slice(0, 6), 'classic'), 6, () => 0.5)
  assert.equal(round.length, 6)
  assert.deepEqual(new Set(round.map((word) => word.id)).size, 6)
})

test('an 18-word set creates three independently playable classic rounds', () => {
  const rounds = createRounds(eligibleWords(words, 'classic'), 6, () => 0.25)
  assert.deepEqual(rounds.map((round) => round.length), [6, 6, 6])
  assert.equal(new Set(rounds.flatMap((round) => round.map((word) => word.id))).size, 18)
})

test('mode validation excludes incomplete matching data', () => {
  const invalid = [
    { id: 1, word: 'valid', meaning_vi: 'hợp lệ', example: 'A valid example.', image_url: 'image.jpg' },
    { id: 2, word: 'no meaning', meaning_vi: '', example: 'Example.', image_url: 'image.jpg' },
    { id: 3, word: 'no example', meaning_vi: 'thiếu ví dụ', example: '', image_url: 'image.jpg' },
    { id: 4, word: 'no image', meaning_vi: 'thiếu ảnh', example: 'Example.', image_url: '' },
  ]
  assert.deepEqual(eligibleWords(invalid, 'classic').map(({ id }) => id), [1, 3, 4])
  assert.deepEqual(eligibleWords(invalid, 'deep').map(({ id }) => id), [1, 4])
  assert.deepEqual(eligibleWords(invalid, 'visual').map(({ id }) => id), [1, 2, 3])
})

test('target shuffling retains all choices without mutation', () => {
  const source = words.slice(0, 6)
  const result = shuffle(source, () => 0)
  assert.deepEqual(source.map((word) => word.id), [1, 2, 3, 4, 5, 6])
  assert.deepEqual([...result.map((word) => word.id)].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6])
})

test('summary accuracy and timers include wrong attempts', () => {
  assert.equal(calculateAccuracy(6, 2), 75)
  assert.equal(calculateAccuracy(0, 0), 0)
  assert.equal(formatElapsed(60), '1:00')
  assert.equal(formatElapsed(125), '2:05')
})
