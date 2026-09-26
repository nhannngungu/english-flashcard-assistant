import { createConfiguredVocabularyRankingProvider } from './ai/openaiVocabularyRanking.js'

function normalizeTerm(value) {
  return typeof value === 'string'
    ? value.trim().replace(/’/gu, "'").replace(/\s+/gu, ' ').toLocaleLowerCase('en-US')
    : ''
}

export function validateVocabularyRankingOutput(value, candidates) {
  if (!value || !Array.isArray(value.recommendations)) return []

  const allowed = new Map(candidates.map((candidate) => [normalizeTerm(candidate.term), candidate]))
  const seen = new Set()
  const validated = []

  for (const item of value.recommendations) {
    const normalizedTerm = normalizeTerm(item?.term)
    const candidate = allowed.get(normalizedTerm)
    const score = Number(item?.score)
    const reason = typeof item?.reason === 'string' ? item.reason.trim().replace(/\s+/gu, ' ') : ''

    if (
      !candidate
      || seen.has(normalizedTerm)
      || item?.type !== candidate.type
      || !['high', 'medium', 'low'].includes(item?.priority)
      || !Number.isFinite(score)
      || score < 0
      || score > 1
      || !reason
    ) continue

    seen.add(normalizedTerm)
    validated.push({
      term: candidate.term,
      type: candidate.type,
      priority: item.priority,
      score,
      reason: reason.slice(0, 240),
    })
  }

  return validated
}

export async function rankVocabularyCandidates(
  { text, candidates, learnerPreferences },
  { provider = createConfiguredVocabularyRankingProvider() } = {},
) {
  if (!provider) {
    return { status: 'unavailable', provider: null, recommendations: [], reason: 'not-configured' }
  }

  try {
    const output = await provider.rank({ text, candidates, learnerPreferences })
    const recommendations = validateVocabularyRankingOutput(output, candidates)

    if (recommendations.length === 0) {
      return { status: 'unavailable', provider: provider.name, recommendations: [], reason: 'invalid-output' }
    }

    return { status: 'used', provider: provider.name, recommendations }
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'timeout' : 'provider-error'
    console.warn(`[vocabulary-ranking] Optional provider unavailable (${reason}).`)
    return { status: 'unavailable', provider: provider.name, recommendations: [], reason }
  }
}
