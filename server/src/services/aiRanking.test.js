import assert from 'node:assert/strict'
import test from 'node:test'
import { rankVocabularyCandidates, validateVocabularyRankingOutput } from './aiRanking.js'
import { createOpenAiVocabularyRankingProvider } from './ai/openaiVocabularyRanking.js'

const candidates = [
  { term: 'depend on', type: 'phrase' },
  { term: 'significant', type: 'word' },
]

test('AI output validation accepts only known candidates and contract fields', () => {
  const validated = validateVocabularyRankingOutput({
    recommendations: [
      { term: 'depend on', type: 'phrase', priority: 'high', score: 0.9, reason: 'Useful collocation.' },
      { term: 'invented term', type: 'word', priority: 'high', score: 1, reason: 'Not allowed.' },
      { term: 'significant', type: 'phrase', priority: 'medium', score: 0.7, reason: 'Wrong type.' },
      { term: 'significant', type: 'word', priority: 'urgent', score: 0.7, reason: 'Wrong priority.' },
    ],
  }, candidates)

  assert.deepEqual(validated, [{
    term: 'depend on',
    type: 'phrase',
    priority: 'high',
    score: 0.9,
    reason: 'Useful collocation.',
  }])
})

test('AI ranking returns deterministic fallback status when no provider is configured', async () => {
  const result = await rankVocabularyCandidates({
    text: 'A short passage.',
    candidates,
    learnerPreferences: { goal: 'general', target_level: 'B2' },
  }, { provider: null })

  assert.equal(result.status, 'unavailable')
  assert.deepEqual(result.recommendations, [])
})

test('AI ranking treats malformed provider output as unavailable', async () => {
  const provider = {
    name: 'test-provider',
    async rank() {
      return { recommendations: [{ term: 'unknown', score: 'high' }] }
    },
  }
  const result = await rankVocabularyCandidates({
    text: 'A short passage.',
    candidates,
    learnerPreferences: { goal: 'general', target_level: 'B2' },
  }, { provider })

  assert.equal(result.status, 'unavailable')
  assert.equal(result.reason, 'invalid-output')
})

test('OpenAI provider makes one structured request with only candidate sentence context', async () => {
  let requestCount = 0
  let requestBody
  const provider = createOpenAiVocabularyRankingProvider({
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      requestCount += 1
      requestBody = JSON.parse(options.body)
      return {
        ok: true,
        async json() {
          return {
            output: [{
              content: [{
                type: 'output_text',
                text: JSON.stringify({
                  recommendations: [{
                    term: 'depend on',
                    type: 'phrase',
                    priority: 'high',
                    score: 0.9,
                    reason: 'Useful collocation.',
                  }],
                }),
              }],
            }],
          }
        },
      }
    },
  })

  await provider.rank({
    text: 'Unrelated surrounding text should not be sent when sentence context is available.',
    candidates: [{
      ...candidates[0],
      sentence: 'Learners depend on reliable context.',
      cefr_level: 'Unknown',
      deterministic_score: 70,
      occurrence_count: 1,
      existing: false,
    }],
    learnerPreferences: { goal: 'general', target_level: 'B2' },
  })

  const providerInput = JSON.parse(requestBody.input[1].content)
  assert.equal(requestCount, 1)
  assert.equal(requestBody.store, false)
  assert.equal(requestBody.text.format.type, 'json_schema')
  assert.equal(providerInput.passage_context, 'Learners depend on reliable context.')
  assert.equal('definition' in providerInput.candidates[0], false)
})
