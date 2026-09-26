import assert from 'node:assert/strict'
import test from 'node:test'
import { extractContainingSentence, extractSurroundingContext } from './textContext.js'

test('extracts the sentence containing the clicked occurrence', () => {
  const text = 'The first bank closed. They sat on the river bank and watched the water. Another sentence.'
  const start = text.indexOf('bank', text.indexOf('river'))

  assert.equal(
    extractContainingSentence(text, start, start + 4),
    'They sat on the river bank and watched the water.',
  )
})

test('treats line breaks as sentence boundaries and safely clips surrounding context', () => {
  const text = 'Heading\nA mouse ran across the kitchen floor.\nNotes'
  const start = text.indexOf('mouse')

  assert.equal(extractContainingSentence(text, start, start + 5), 'A mouse ran across the kitchen floor.')
  assert.match(extractSurroundingContext(text, start, start + 5, 12), /mouse/u)
})
