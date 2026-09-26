import { normalizeExistingVocabulary, resolveCefrWord } from './cefrAnalysis.js'

export const maximumRecommendationCandidates = 75

const levelOrder = new Map(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((level, index) => [level, index]))
const levelWeights = {
  A1: 2,
  A2: 8,
  B1: 18,
  B2: 24,
  C1: 20,
  C2: 10,
  Unknown: 12,
}

const excludedWords = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'so', 'than', 'that', 'this', 'these', 'those',
  'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'ours', 'you', 'your', 'yours', 'he', 'him',
  'his', 'she', 'her', 'hers', 'it', 'its', 'they', 'them', 'their', 'theirs', 'who', 'whom',
  'which', 'what', 'someone', 'something', 'anyone', 'anything', 'everyone', 'everything',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
  'did', 'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
  'to', 'of', 'in', 'on', 'at', 'by', 'for', 'from', 'with', 'as', 'into', 'onto', 'up', 'down',
  'not', 'no', 'yes', 'very', 'also', 'there', 'here', 'then', 'when', 'where', 'why', 'how',
])

const veryBasicWords = new Set([
  'all', 'another', 'any', 'day', 'good', 'make', 'many', 'more', 'most', 'new', 'now', 'one',
  'only', 'other', 'people', 'same', 'some', 'thing', 'time', 'two', 'use', 'way', 'work',
])

const academicUtilityWords = new Set([
  'analysis', 'approach', 'assess', 'benefit', 'concentration', 'consequence', 'context', 'data',
  'dependence', 'environment', 'evidence', 'excessive', 'factor', 'impact', 'indicate', 'method',
  'process', 'require', 'research', 'significant', 'structure', 'technology', 'transform', 'vary',
])

// These are intentionally curated expressions. We do not generate arbitrary n-grams as collocations.
const phraseRules = [
  { pattern: /\b(?:be|am|is|are|was|were|been|being)\s+dependent\s+on\b/giu, term: 'be dependent on' },
  { pattern: /\bdependent\s+on\b/giu, term: 'dependent on' },
  { pattern: /\bdepend(?:s|ed|ing)?\s+on\b/giu, term: 'depend on' },
  { pattern: /\b(?:take|takes|took|taken|taking)\s+advantage\s+of\b/giu, term: 'take advantage of' },
  { pattern: /\bin\s+contrast\s+to\b/giu, term: 'in contrast to' },
  { pattern: /\b(?:play|plays|played|playing)\s+an\s+important\s+role\b/giu, term: 'play an important role' },
  { pattern: /\bface[-\s]to[-\s]face\b/giu, term: 'face-to-face' },
  { pattern: /\bas\s+a\s+result\b/giu, term: 'as a result' },
  { pattern: /\bbalanced\s+approach\b/giu, term: 'balanced approach' },
]

function cleanSurface(value) {
  return typeof value === 'string'
    ? value.trim().replace(/’/gu, "'").replace(/\s+/gu, ' ')
    : ''
}

function sentenceContext(text, start, end) {
  let sentenceStart = start
  let sentenceEnd = end

  while (sentenceStart > 0 && !/[.!?\n]/u.test(text[sentenceStart - 1])) sentenceStart -= 1
  while (sentenceEnd < text.length && !/[.!?\n]/u.test(text[sentenceEnd])) sentenceEnd += 1
  if (sentenceEnd < text.length && /[.!?]/u.test(text[sentenceEnd])) sentenceEnd += 1

  const surroundingStart = Math.max(0, sentenceStart - 240)
  const surroundingEnd = Math.min(text.length, sentenceEnd + 240)

  return {
    sentence: text.slice(sentenceStart, sentenceEnd).trim(),
    surrounding_context: text.slice(surroundingStart, surroundingEnd).trim(),
  }
}

function candidateOccurrence(text, start, end) {
  return {
    start,
    end,
    ...sentenceContext(text, start, end),
  }
}

function addOrMergeCandidate(candidateMap, candidate) {
  const current = candidateMap.get(candidate.normalized)

  if (!current) {
    candidateMap.set(candidate.normalized, candidate)
    return
  }

  const occurrenceKeys = new Set(current.occurrences.map((item) => `${item.start}:${item.end}`))
  for (const occurrence of candidate.occurrences) {
    const key = `${occurrence.start}:${occurrence.end}`
    if (!occurrenceKeys.has(key)) {
      current.occurrences.push(occurrence)
      occurrenceKeys.add(key)
    }
  }

  if (candidate.type === 'phrase') current.type = 'phrase'
  current.curated_collocation = current.curated_collocation || candidate.curated_collocation
  current.existing = current.existing || candidate.existing
}

function createCandidate({ term, type, start, end, text, existingVocabulary, curatedCollocation = false }) {
  const cleanedTerm = cleanSurface(term)
  const resolved = resolveCefrWord(cleanedTerm)
  const normalized = type === 'phrase'
    ? cleanedTerm.toLocaleLowerCase('en-US')
    : resolved.normalized

  return {
    term: cleanedTerm,
    normalized,
    type,
    cefr_level: resolved.level,
    existing: existingVocabulary.has(normalizeExistingVocabulary(normalized)),
    curated_collocation: curatedCollocation,
    occurrences: [candidateOccurrence(text, start, end)],
  }
}

function addWordCandidates(candidateMap, text, analysis, existingVocabulary) {
  for (const token of analysis.tokens) {
    if (excludedWords.has(token.normalized) || !/\p{L}/u.test(token.text)) continue

    addOrMergeCandidate(candidateMap, createCandidate({
      term: token.text,
      type: 'word',
      start: token.start,
      end: token.end,
      text,
      existingVocabulary,
    }))
  }
}

function addCuratedPhrases(candidateMap, text, existingVocabulary) {
  for (const rule of phraseRules) {
    for (const match of text.matchAll(rule.pattern)) {
      addOrMergeCandidate(candidateMap, createCandidate({
        term: rule.term,
        type: 'phrase',
        start: match.index,
        end: match.index + match[0].length,
        text,
        existingVocabulary,
        curatedCollocation: true,
      }))
    }
  }
}

function addRepeatedMeaningfulPhrases(candidateMap, text, analysis, existingVocabulary) {
  const repeated = new Map()

  for (let index = 0; index < analysis.tokens.length - 1; index += 1) {
    const first = analysis.tokens[index]
    const second = analysis.tokens[index + 1]
    const between = text.slice(first.end, second.start)

    if (!/^\s+$/u.test(between)) continue
    if (excludedWords.has(first.normalized) || excludedWords.has(second.normalized)) continue
    if (veryBasicWords.has(first.normalized) || veryBasicWords.has(second.normalized)) continue
    if (![first.level, second.level].some((level) => level === 'Unknown' || ['B1', 'B2', 'C1', 'C2'].includes(level))) continue

    const normalized = `${first.normalized} ${second.normalized}`
    const occurrence = { start: first.start, end: second.end }
    const entry = repeated.get(normalized) || { normalized, occurrences: [] }
    entry.occurrences.push(occurrence)
    repeated.set(normalized, entry)
  }

  for (const entry of repeated.values()) {
    if (entry.occurrences.length < 2 || candidateMap.has(entry.normalized)) continue

    for (const occurrence of entry.occurrences) {
      addOrMergeCandidate(candidateMap, createCandidate({
        term: text.slice(occurrence.start, occurrence.end).toLocaleLowerCase('en-US'),
        type: 'phrase',
        start: occurrence.start,
        end: occurrence.end,
        text,
        existingVocabulary,
      }))
    }
  }
}

function targetLevelBonus(level, targetLevel) {
  if (!levelOrder.has(level) || !levelOrder.has(targetLevel)) return 0
  const distance = Math.abs(levelOrder.get(level) - levelOrder.get(targetLevel))
  return Math.max(0, 12 - (distance * 4))
}

function scoreCandidate(candidate, preferences) {
  let score = 25 + (levelWeights[candidate.cefr_level] || 0)
  const reasons = []
  const occurrenceCount = candidate.occurrences.length
  const targetBonus = targetLevelBonus(candidate.cefr_level, preferences.target_level)

  if (['B1', 'B2', 'C1'].includes(candidate.cefr_level)) {
    reasons.push(`${candidate.cefr_level} vocabulary near the most useful learning range`)
  } else if (candidate.cefr_level === 'Unknown') {
    reasons.push('valid vocabulary not classified by the local CEFR dataset')
  }

  score += targetBonus
  if (targetBonus >= 8) reasons.push(`close to the ${preferences.target_level} target`)

  if (occurrenceCount > 1) {
    score += Math.min(12, (occurrenceCount - 1) * 6)
    reasons.push(`repeated ${occurrenceCount} times in the passage`)
  }

  if (candidate.type === 'phrase') {
    score += 20
    reasons.push(candidate.curated_collocation ? 'useful collocation or expression' : 'repeated meaningful phrase')
  }

  if (candidate.curated_collocation) score += 8
  if (candidate.term.length >= 12) score += 5
  else if (candidate.term.length >= 8) score += 3

  if (academicUtilityWords.has(candidate.normalized)) {
    score += 20
    reasons.push('broad learning or academic utility')
  }

  if (preferences.goal === 'ielts' && (
    academicUtilityWords.has(candidate.normalized)
    || ['B2', 'C1'].includes(candidate.cefr_level)
    || candidate.curated_collocation
  )) {
    score += 9
    reasons.push('useful for IELTS or academic English')
  }

  if (veryBasicWords.has(candidate.normalized)) {
    score -= 22
    reasons.push('very common vocabulary')
  }

  if (candidate.existing) {
    score -= 100
    reasons.push('already in vocabulary')
  }

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)))
  const priority = boundedScore >= 60
    ? 'recommended'
    : boundedScore >= 38 ? 'worth-considering' : 'lower-priority'

  return {
    ...candidate,
    occurrence_count: occurrenceCount,
    occurrences: undefined,
    ...candidate.occurrences[0],
    deterministic_score: boundedScore,
    deterministic_priority: candidate.existing ? 'lower-priority' : priority,
    priority: candidate.existing ? 'lower-priority' : priority,
    ranking_source: 'deterministic',
    reason: reasons.length
      ? `${reasons.slice(0, 3).join('; ')}.`
      : 'Potentially useful vocabulary from this passage.',
  }
}

export function generateVocabularyCandidates({
  text,
  analysis,
  existingVocabulary = new Set(),
  learnerPreferences = {},
  limit = maximumRecommendationCandidates,
}) {
  const preferences = {
    goal: learnerPreferences.goal === 'ielts' ? 'ielts' : 'general',
    target_level: ['A2', 'B1', 'B2', 'C1'].includes(learnerPreferences.target_level)
      ? learnerPreferences.target_level
      : 'B2',
  }
  const candidateMap = new Map()

  addWordCandidates(candidateMap, text, analysis, existingVocabulary)
  addCuratedPhrases(candidateMap, text, existingVocabulary)
  addRepeatedMeaningfulPhrases(candidateMap, text, analysis, existingVocabulary)

  return [...candidateMap.values()]
    .map((candidate) => scoreCandidate(candidate, preferences))
    .sort((left, right) => (
      right.deterministic_score - left.deterministic_score
      || right.occurrence_count - left.occurrence_count
      || left.term.localeCompare(right.term)
    ))
    .slice(0, Math.max(1, Math.min(maximumRecommendationCandidates, limit)))
}

const aiPriorityMap = {
  high: 'recommended',
  medium: 'worth-considering',
  low: 'lower-priority',
}

export function applyAiRecommendations(candidates, aiRecommendations) {
  const recommendationMap = new Map(aiRecommendations.map((item) => [cleanSurface(item.term).toLocaleLowerCase('en-US'), item]))

  return candidates
    .map((candidate) => {
      const aiRecommendation = recommendationMap.get(candidate.term.toLocaleLowerCase('en-US'))
      if (!aiRecommendation || candidate.existing) return candidate

      return {
        ...candidate,
        ai_priority: aiRecommendation.priority,
        ai_score: aiRecommendation.score,
        priority: candidate.existing ? 'lower-priority' : aiPriorityMap[aiRecommendation.priority],
        ranking_source: 'ai',
        reason: aiRecommendation.reason,
      }
    })
    .sort((left, right) => {
      const leftAi = left.ranking_source === 'ai' ? 1 : 0
      const rightAi = right.ranking_source === 'ai' ? 1 : 0
      const priorityRank = { recommended: 3, 'worth-considering': 2, 'lower-priority': 1 }

      return priorityRank[right.priority] - priorityRank[left.priority]
        || rightAi - leftAi
        || (right.ai_score || 0) - (left.ai_score || 0)
        || right.deterministic_score - left.deterministic_score
    })
}
