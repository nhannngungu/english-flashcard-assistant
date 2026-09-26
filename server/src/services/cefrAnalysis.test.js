import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeCefrText, resolveCefrWord } from './cefrAnalysis.js'

const sampleParagraph = 'Against this traditional framework stood the new Linnaean system of classification, which sought to introduce more scientific values into the classification of living things. Barely half a century old in 1818, the Linnaean system controversially classified whales as mammals because they shared two mammalian characteristics: they were warm-blooded and breathed air.'

test('preserves exact token offsets so original formatting can be reconstructed', () => {
  const text = "Hello,\n  running mother-in-law — whales!"
  const { tokens } = analyzeCefrText(text)

  assert.deepEqual(tokens.map((token) => token.text), ['Hello', 'running', 'mother-in-law', 'whales'])
  assert.equal(tokens.map((token) => text.slice(token.start, token.end)).join('|'), 'Hello|running|mother-in-law|whales')
  assert.equal(tokens.find((token) => token.text === 'running').normalized, 'running')
  assert.equal(tokens.find((token) => token.text === 'whales').normalized, 'whale')
})

test('uses safe dataset-backed lemma candidates and leaves unmatched words unknown', () => {
  assert.deepEqual(resolveCefrWord('opportunities'), { normalized: 'opportunity', level: 'A2' })
  assert.equal(resolveCefrWord('Linnaean').level, 'Unknown')
})

test('analyzes the requested paragraph deterministically and marks existing lemmas', () => {
  const result = analyzeCefrText(sampleParagraph, new Set(['classification', 'whale']))
  const classifications = result.tokens.filter((token) => token.normalized === 'classification')
  const whale = result.tokens.find((token) => token.normalized === 'whale')

  assert.equal(result.tokens.length, 50)
  assert.equal(classifications.length, 2)
  assert.ok(classifications.every((token) => token.existing))
  assert.equal(whale.existing, true)
  assert.equal(result.summary.B2 >= 2, true)
  assert.equal(result.summary.Unknown >= 1, true)
})
