import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeCefrText } from './cefrAnalysis.js'
import {
  applyAiRecommendations,
  generateVocabularyCandidates,
} from './vocabularyRecommendations.js'

const passage = `Technology has transformed the way people communicate and work.
Although digital tools provide significant benefits, excessive
dependence on technology can negatively affect concentration and
face-to-face communication. Therefore, people should develop a
balanced approach and take advantage of technology without becoming
overly dependent on it.`

test('candidate generation keeps useful words and curated phrases above basic vocabulary', () => {
  const analysis = analyzeCefrText(passage)
  const candidates = generateVocabularyCandidates({
    text: passage,
    analysis,
    learnerPreferences: { goal: 'general', target_level: 'B2' },
  })
  const byTerm = new Map(candidates.map((candidate) => [candidate.term.toLocaleLowerCase('en-US'), candidate]))

  for (const term of [
    'transformed',
    'significant',
    'excessive',
    'dependence',
    'concentration',
    'face-to-face',
    'balanced approach',
    'take advantage of',
    'dependent on',
  ]) {
    assert.equal(byTerm.get(term)?.priority, 'recommended', `${term} should be recommended`)
  }

  assert.equal(byTerm.get('face-to-face').type, 'phrase')
  assert.equal(byTerm.get('take advantage of').sentence.includes('take advantage of'), true)
  assert.equal(byTerm.has('the'), false)
  assert.equal(byTerm.has('and'), false)
  assert.equal(byTerm.has('can'), false)
  assert.notEqual(byTerm.get('people')?.priority, 'recommended')
})

test('existing vocabulary stays visible but is lowered and never promoted by AI', () => {
  const existingVocabulary = new Set(['excessive'])
  const analysis = analyzeCefrText(passage, existingVocabulary)
  const candidates = generateVocabularyCandidates({
    text: passage,
    analysis,
    existingVocabulary,
    learnerPreferences: { goal: 'ielts', target_level: 'B2' },
  })
  const excessive = candidates.find((candidate) => candidate.term.toLocaleLowerCase('en-US') === 'excessive')
  const ranked = applyAiRecommendations(candidates, [{
    term: excessive.term,
    type: 'word',
    priority: 'high',
    score: 0.99,
    reason: 'Useful academic adjective.',
  }])
  const rankedExcessive = ranked.find((candidate) => candidate.normalized === excessive.normalized)

  assert.equal(rankedExcessive.existing, true)
  assert.equal(rankedExcessive.priority, 'lower-priority')
  assert.equal(rankedExcessive.ranking_source, 'deterministic')
})

test('repeated phrase detection requires repetition and meaningful words', () => {
  const text = 'Significant benefits change decisions. Significant benefits also support action.'
  const candidates = generateVocabularyCandidates({
    text,
    analysis: analyzeCefrText(text),
    learnerPreferences: { goal: 'general', target_level: 'B2' },
  })

  assert.equal(candidates.some((candidate) => candidate.term === 'significant benefits' && candidate.type === 'phrase'), true)
  assert.equal(candidates.some((candidate) => candidate.term === 'also supports'), false)
})
