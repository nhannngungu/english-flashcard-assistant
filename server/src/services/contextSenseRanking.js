const stopWords = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'but', 'by',
  'every', 'for', 'from', 'had', 'has', 'have', 'he', 'her', 'his', 'i', 'in', 'is', 'it',
  'its', 'of', 'on', 'one', 'or', 'our', 'she', 'so', 'that', 'the', 'their', 'them',
  'they', 'this', 'to', 'was', 'we', 'were', 'which', 'with', 'you', 'your',
])

const conceptGroups = [
  new Set(['account', 'cash', 'deposit', 'finance', 'financial', 'income', 'institution', 'loan', 'money', 'pay', 'salary']),
  new Set(['edge', 'land', 'river', 'riverbank', 'shore', 'stream', 'water']),
  new Set(['bought', 'button', 'buy', 'click', 'computer', 'cursor', 'device', 'hardware', 'input', 'keyboard', 'software', 'working']),
  new Set(['animal', 'cheese', 'floor', 'kitchen', 'mice', 'mouse', 'rat', 'rodent', 'tail']),
  new Set(['business', 'company', 'direct', 'manage', 'operate', 'organization', 'software', 'successful']),
  new Set(['exercise', 'foot', 'jog', 'morning', 'move', 'quickly', 'race', 'run', 'runner', 'running']),
]

const articles = new Set(['a', 'an', 'the', 'this', 'that'])
const pronouns = new Set(['he', 'i', 'it', 'she', 'they', 'we', 'you'])

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function simpleLemma(word) {
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`
  if (word.endsWith('ied') && word.length > 4) return `${word.slice(0, -3)}y`

  if (word.endsWith('ing') && word.length > 5) {
    const stem = word.slice(0, -3)
    if (/([b-df-hj-np-tv-z])\1$/u.test(stem)) return stem.slice(0, -1)
    return stem
  }

  if (word.endsWith('ed') && word.length > 4) {
    const stem = word.slice(0, -2)
    if (/([b-df-hj-np-tv-z])\1$/u.test(stem)) return stem.slice(0, -1)
    return stem
  }

  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2)
  if (word.endsWith('s') && word.length > 3 && !/(?:ss|us|is)$/u.test(word)) return word.slice(0, -1)
  return word
}

function tokenize(value) {
  return (cleanText(value).toLocaleLowerCase('en-US').match(/[a-z]+(?:['’-][a-z]+)*/gu) || [])
    .map((word) => word.replace(/’/gu, "'"))
}

function meaningfulTerms(value, excludedTerms = new Set()) {
  const terms = new Set()

  for (const word of tokenize(value)) {
    const lemma = simpleLemma(word)

    if (!stopWords.has(word) && !excludedTerms.has(word)) terms.add(word)
    if (!stopWords.has(lemma) && !excludedTerms.has(lemma)) terms.add(lemma)
  }

  return terms
}

function intersectionCount(first, second) {
  let count = 0
  for (const value of first) if (second.has(value)) count += 1
  return count
}

function bigrams(value, excludedTerms) {
  const words = tokenize(value).map(simpleLemma).filter((word) => !excludedTerms.has(word))
  const result = new Set()
  for (let index = 0; index < words.length - 1; index += 1) result.add(`${words[index]} ${words[index + 1]}`)
  return result
}

function inferPartOfSpeech(sentence, originalWord, normalizedWord) {
  const words = tokenize(sentence)
  const original = cleanText(originalWord).toLocaleLowerCase('en-US').replace(/’/gu, "'")
  const normalized = cleanText(normalizedWord).toLocaleLowerCase('en-US').replace(/’/gu, "'")
  const index = words.findIndex((word) => word === original || word === normalized || simpleLemma(word) === normalized)

  if (index === -1) return ''

  const previous = words[index - 1] || ''
  if (articles.has(previous)) return 'noun'
  if (previous === 'to') return 'verb'
  if (pronouns.has(previous) && (original !== normalized || /(?:ed|ing|s)$/u.test(original))) return 'verb'
  return ''
}

function targetNeighbors(sentence, originalWord, normalizedWord) {
  const words = tokenize(sentence)
  const original = cleanText(originalWord).toLocaleLowerCase('en-US').replace(/’/gu, "'")
  const normalized = cleanText(normalizedWord).toLocaleLowerCase('en-US').replace(/’/gu, "'")
  const index = words.findIndex((word) => word === original || word === normalized || simpleLemma(word) === normalized)

  return {
    previous: index > 0 ? words[index - 1] : '',
    next: index >= 0 ? words[index + 1] || '' : '',
  }
}

function scoreCandidate(candidate, context) {
  const definitionTerms = meaningfulTerms(candidate.definition, context.excludedTerms)
  const exampleTerms = meaningfulTerms(candidate.example, context.excludedTerms)
  let score = 0

  score += intersectionCount(context.terms, definitionTerms) * 3
  score += intersectionCount(context.terms, exampleTerms) * 1.5
  score += intersectionCount(context.bigrams, bigrams(candidate.definition, context.excludedTerms)) * 2

  for (const group of conceptGroups) {
    const contextMatchesGroup = [...context.terms].some((term) => group.has(term))
    const candidateMatchesGroup = [...definitionTerms, ...exampleTerms].some((term) => group.has(term))
    if (contextMatchesGroup && candidateMatchesGroup) score += 5
  }

  const partOfSpeech = cleanText(candidate.part_of_speech).toLocaleLowerCase('en-US')
  if (context.inferredPartOfSpeech) {
    score += partOfSpeech.includes(context.inferredPartOfSpeech) ? 2 : -0.5
  }

  score += Math.max(0, 1.5 - Math.min(Number(candidate.learner_rank) || 0, 10) * 0.15)

  if (candidate.example) score += 0.5
  if (candidate.definition.length > 220) score -= 1

  if (
    /^(?:cause|make|force|allow)\b/iu.test(candidate.definition)
    && ['daily', 'every', 'morning', 'often', 'quickly', 'slowly'].includes(context.neighbors.next)
  ) {
    score -= 4
  }

  return score
}

function confidenceLabel(topScore, gap) {
  if (topScore >= 8 && gap >= 3) return 'high'
  if (topScore >= 4 && gap >= 2) return 'medium'
  return 'low'
}

export function rankContextualSenses({ candidates, normalizedWord, sentence, word }) {
  const excludedTerms = new Set([
    ...tokenize(word),
    ...tokenize(normalizedWord),
    ...tokenize(word).map(simpleLemma),
    ...tokenize(normalizedWord).map(simpleLemma),
  ])
  const context = {
    bigrams: bigrams(sentence, excludedTerms),
    excludedTerms,
    inferredPartOfSpeech: inferPartOfSpeech(sentence, word, normalizedWord),
    neighbors: targetNeighbors(sentence, word, normalizedWord),
    terms: meaningfulTerms(sentence, excludedTerms),
  }
  const ranked = (Array.isArray(candidates) ? candidates : [])
    .map((candidate, index) => ({
      ...candidate,
      context_score: scoreCandidate(candidate, context),
      original_order: index,
    }))
    .sort((first, second) =>
      second.context_score - first.context_score || first.original_order - second.original_order,
    )

  const topScore = ranked[0]?.context_score ?? 0
  const secondScore = ranked[1]?.context_score ?? Number.NEGATIVE_INFINITY
  const gap = topScore - secondScore

  return {
    ranked,
    ambiguous: ranked.length > 1 && gap < 2,
    confidence: confidenceLabel(topScore, gap),
  }
}

export function chooseContextualExample(candidate, sentence) {
  const dictionaryExample = cleanText(candidate?.example)
  if (dictionaryExample) return { example: dictionaryExample, exampleSource: 'dictionary' }

  if ((candidate?.context_score ?? 0) >= 4 && cleanText(sentence)) {
    return { example: cleanText(sentence), exampleSource: 'context' }
  }

  return { example: '', exampleSource: '' }
}
