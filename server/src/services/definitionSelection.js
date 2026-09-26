const stronglyDiscouragedLabels = [
  'archaic',
  'dated',
  'historical',
  'obsolete',
  'rare',
]

const regionalLabels = [
  'american',
  'australia',
  'australian',
  'british',
  'canada',
  'canadian',
  'india',
  'indian',
  'ireland',
  'irish',
  'new zealand',
  'scotland',
  'scottish',
  'uk',
  'us',
]

const specializedLabels = [
  'american football',
  'anatomy',
  'aviation',
  'biology',
  'botany',
  'chemistry',
  'chess',
  'computing',
  'economics',
  'falconry',
  'finance',
  'geography',
  'geology',
  'heraldry',
  'hydrology',
  'law',
  'mathematics',
  'medicine',
  'military',
  'mining',
  'nautical',
  'physics',
  'rail transport',
  'sports',
  'taxonomy',
  'unix',
]

const usageLabels = [
  ...stronglyDiscouragedLabels,
  ...regionalLabels,
  ...specializedLabels,
  'chiefly',
  'colloquial',
  'countable',
  'figurative',
  'figuratively',
  'formal',
  'in compounds',
  'informal',
  'intransitive',
  'literary',
  'often',
  'slang',
  'transitive',
  'uncountable',
  'usually',
]

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function includesLabel(text, labels) {
  return labels.some((label) => new RegExp(`(^|[^a-z])${label.replace(' ', '\\s+')}([^a-z]|$)`, 'i').test(text))
}

function isUsageLabel(label, tags) {
  const normalizedLabel = label.toLowerCase()

  return (
    includesLabel(normalizedLabel, usageLabels) ||
    tags.some((tag) => {
      const normalizedTag = cleanText(tag).toLowerCase()
      return normalizedTag && normalizedLabel.includes(normalizedTag)
    })
  )
}

function removeLeadingUsageLabels(definition, tags) {
  let cleanedDefinition = definition
  const removedLabels = []

  while (true) {
    const match = cleanedDefinition.match(/^\s*\(([^()]*)\)\s*/)

    if (!match || !isUsageLabel(match[1], tags)) {
      break
    }

    removedLabels.push(match[1])
    cleanedDefinition = cleanedDefinition.slice(match[0].length)
  }

  return { cleanedDefinition, removedLabels }
}

function removeRedundantClosingClause(definition) {
  const clauses = definition.split(';').map((clause) => clause.trim())

  if (clauses.length !== 2) {
    return definition
  }

  const words = (clause) =>
    clause
      .toLowerCase()
      .match(/[a-z]+/g)
      ?.filter((word) => word.length > 3 && !['such', 'that', 'this', 'with'].includes(word)) || []
  const firstWords = new Set(words(clauses[0]))
  const secondWords = words(clauses[1])

  if (secondWords.length <= 4 && secondWords.some((word) => firstWords.has(word))) {
    return `${clauses[0].replace(/[.!?]+$/, '')}.`
  }

  return definition
}

function simplifyEquivalentList(definition) {
  const punctuation = definition.match(/[.!?]$/)?.[0] || ''
  const items = definition
    .replace(/[.!?]$/, '')
    .split(',')
    .map((item) => item.trim())

  const isShortEquivalentList =
    items.length >= 2 &&
    items.length <= 4 &&
    items.every((item) => item.split(/\s+/).length <= 4 && !/\b(?:and|or)\b/i.test(item))

  if (!isShortEquivalentList) {
    return definition
  }

  return `${items[0]}${punctuation || '.'}`
}

function simplifyForPartOfSpeech(definition, partOfSpeech) {
  if (cleanText(partOfSpeech).toLowerCase() === 'verb' && /^To\s+[a-z]/.test(definition)) {
    return `${definition.charAt(3).toUpperCase()}${definition.slice(4)}`
  }

  return definition
}

export function cleanLearnerDefinition(value, tags = []) {
  const definition = cleanText(value)

  if (!definition) {
    return { definition: '', removedLabels: [] }
  }

  const { cleanedDefinition, removedLabels } = removeLeadingUsageLabels(definition, tags)
  const cleanedText = simplifyEquivalentList(removeRedundantClosingClause(cleanedDefinition))
    .replace(/\bplace and borrow money\b/gi, 'deposit and borrow money')
    .replace(/\s+and (?:take care of|handle|manage) [^.]+(?=[.!?]?$)/i, '')
    .replace(/\s*\[(?:from|since|attested)\s+[^\]]+\]\s*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[,;:\s–—-]+/, '')
    .trim()

  return {
    definition: cleanedText,
    removedLabels,
  }
}

function firstExample(value) {
  if (!Array.isArray(value)) {
    return cleanText(value)
  }

  for (const example of value) {
    const exampleText = cleanText(example) || cleanText(example?.text)

    if (exampleText) {
      return exampleText
    }
  }

  return ''
}

export function getCrossReferenceTarget(value) {
  const definition = cleanText(value)
  const crossReferencePatterns = [
    /^(?:(?:non-?oxford|oxford|british|american|canadian|australian|uk|us|regional|standard|nonstandard|alternative|alternate|obsolete)\s+)*(?:spelling|form) of\s+(.+?)[.!]?$/i,
    /^(?:an?\s+)?(?:alternative|alternate|variant|obsolete)\s+(?:spelling|form)?\s*of\s+(.+?)[.!]?$/i,
    /^(?:see|same as|compare)\s+(.+?)[.!]?$/i,
  ]

  for (const pattern of crossReferencePatterns) {
    const match = definition.match(pattern)
    const target = cleanText(match?.[1])

    if (/^[A-Za-z]+(?:[ '\u2019-][A-Za-z]+)*$/.test(target)) {
      return target
    }
  }

  return ''
}

function isMetadataLikeDefinition(definition) {
  return Boolean(getCrossReferenceTarget(definition)) ||
    /^(?:used|chiefly used|formerly used)\b/i.test(definition) ||
    /\b(?:etymology|derived from|borrowed from|from latin|from greek)\b/i.test(definition) ||
    /^(?:plural|past tense|past participle|present participle) of\b/i.test(definition)
}

function scoreCandidate(candidate) {
  const metadata = [...candidate.tags, ...candidate.removedLabels].join(' ').toLowerCase()
  const definitionLength = candidate.definition.length
  let score = candidate.order * 3 + candidate.depth * 1.5

  if (isMetadataLikeDefinition(candidate.definition)) {
    score += 1_000
  }

  if (includesLabel(metadata, stronglyDiscouragedLabels)) {
    score += 150
  }

  if (includesLabel(metadata, specializedLabels)) {
    score += 65
  }

  if (/\b(?:art movement|card game|falconry|taxonomic classification)\b/i.test(candidate.definition)) {
    score += 65
  }

  const firstSpaceIndex = candidate.definition.indexOf(' ')
  const definitionWithoutFirstWord = firstSpaceIndex >= 0
    ? candidate.definition.slice(firstSpaceIndex + 1)
    : ''

  if (/\b[A-Z][a-z]{2,}\b/.test(definitionWithoutFirstWord)) {
    score += 30
  }

  if (includesLabel(metadata, regionalLabels)) {
    score += 8
  }

  if (includesLabel(metadata, ['slang'])) {
    score += 18
  } else if (includesLabel(metadata, ['colloquial', 'informal'])) {
    score += 3
  }

  if (definitionLength > 70) {
    score += (definitionLength - 70) * 0.15
  }

  if (candidate.example) {
    score -= 3
  }

  return score
}

export function selectLearnerDefinitionCandidates(candidates, limit = 3) {
  const rankedCandidates = []
  let order = 0

  for (const rawCandidate of Array.isArray(candidates) ? candidates : []) {
    const tags = Array.isArray(rawCandidate?.tags) ? rawCandidate.tags : []
    const cleaned = cleanLearnerDefinition(rawCandidate?.definition, tags)
    const definition = simplifyForPartOfSpeech(cleaned.definition, rawCandidate?.partOfSpeech)

    if (!definition) continue

    const candidate = {
      definition,
      depth: Number(rawCandidate?.depth) || 0,
      example: firstExample(rawCandidate?.example),
      order,
      partOfSpeech: cleanText(rawCandidate?.partOfSpeech),
      referenceWord: getCrossReferenceTarget(definition),
      removedLabels: cleaned.removedLabels,
      tags,
    }
    rankedCandidates.push({ ...candidate, score: scoreCandidate(candidate) })
    order += 1
  }

  return rankedCandidates
    .sort((first, second) => first.score - second.score || first.order - second.order)
    .slice(0, limit)
    .map(({ definition, example, partOfSpeech, referenceWord }) => ({
      definition,
      example,
      partOfSpeech,
      referenceWord,
    }))
}

function collectCandidates(senses, partOfSpeech, candidates, state, depth = 0) {
  if (!Array.isArray(senses)) {
    return
  }

  for (const sense of senses) {
    const tags = Array.isArray(sense.tags) ? sense.tags : []
    const cleaned = cleanLearnerDefinition(sense.definition, tags)
    const learnerDefinition = simplifyForPartOfSpeech(cleaned.definition, partOfSpeech)

    if (learnerDefinition) {
      const candidate = {
        definition: learnerDefinition,
        example: firstExample(sense.examples),
        partOfSpeech: cleanText(partOfSpeech),
        referenceWord: getCrossReferenceTarget(learnerDefinition),
        tags,
        removedLabels: cleaned.removedLabels,
        depth,
        order: state.order,
      }

      candidates.push({ ...candidate, score: scoreCandidate(candidate) })
      state.order += 1
    }

    collectCandidates(sense.subsenses, partOfSpeech, candidates, state, depth + 1)
  }
}

export function selectFreeDictionaryApiCandidates(entries, limit = 3) {
  const candidates = []
  const state = { order: 0 }

  for (const entry of Array.isArray(entries) ? entries : []) {
    collectCandidates(entry.senses, entry.partOfSpeech, candidates, state)
  }

  return candidates
    .sort((first, second) => first.score - second.score || first.order - second.order)
    .slice(0, limit)
    .map(({ definition, example, partOfSpeech, referenceWord }) => ({
      definition,
      example,
      partOfSpeech,
      referenceWord,
    }))
}
