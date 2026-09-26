const endpoint = 'https://api.openai.com/v1/responses'
const defaultModel = 'gpt-4o-mini'
const timeoutMilliseconds = 15_000

function outputText(responseBody) {
  if (typeof responseBody?.output_text === 'string') return responseBody.output_text

  return (responseBody?.output || [])
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .filter((content) => content?.type === 'output_text' && typeof content.text === 'string')
    .map((content) => content.text)
    .join('')
}

export function createOpenAiVocabularyRankingProvider({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_RANKING_MODEL || defaultModel,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) return null

  return {
    name: 'openai',
    async rank({ text, candidates, learnerPreferences }) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds)

      const minimalCandidates = candidates.map((candidate) => ({
        term: candidate.term,
        type: candidate.type,
        cefr_level: candidate.cefr_level,
        deterministic_score: candidate.deterministic_score,
        occurrence_count: candidate.occurrence_count,
        already_stored: candidate.existing,
      }))
      const relevantPassage = [...new Set(candidates.map((candidate) => candidate.sentence).filter(Boolean))]
        .join('\n')
        .slice(0, 20_000) || text.slice(0, 20_000)

      try {
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            store: false,
            input: [
              {
                role: 'system',
                content: 'Rank only the supplied vocabulary candidates for a language learner. Prefer useful semantic vocabulary and collocations, not merely the hardest terms. Never add candidates, CEFR levels, definitions, examples, or pronunciation. Return the required JSON structure only.',
              },
              {
                role: 'user',
                content: JSON.stringify({
                  learner_preferences: learnerPreferences,
                  passage_context: relevantPassage,
                  candidates: minimalCandidates,
                }),
              },
            ],
            text: {
              format: {
                type: 'json_schema',
                name: 'vocabulary_recommendations',
                strict: true,
                schema: {
                  type: 'object',
                  properties: {
                    recommendations: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          term: { type: 'string' },
                          type: { type: 'string', enum: ['word', 'phrase'] },
                          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                          score: { type: 'number', minimum: 0, maximum: 1 },
                          reason: { type: 'string' },
                        },
                        required: ['term', 'type', 'priority', 'score', 'reason'],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ['recommendations'],
                  additionalProperties: false,
                },
              },
            },
          }),
          signal: controller.signal,
        })

        if (!response.ok) throw new Error(`AI ranking request failed with status ${response.status}.`)

        const body = await response.json()
        const json = outputText(body)
        if (!json) throw new Error('AI ranking response did not contain structured output.')
        return JSON.parse(json)
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}

export function createConfiguredVocabularyRankingProvider() {
  if (process.env.AI_RANKING_PROVIDER !== 'openai') return null
  return createOpenAiVocabularyRankingProvider()
}
