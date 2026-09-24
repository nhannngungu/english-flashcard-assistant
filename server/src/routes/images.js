import { Router } from 'express'

const router = Router()
const requestTimeoutMilliseconds = 8000
const maximumSuggestions = 3

const blockedTerms = [
  'crossdresser',
  'devil',
  'erotic',
  'fetish',
  'nude',
  'porn',
  'sissy',
]

const irrelevantTerms = [
  'book',
  'book cover',
  'conference',
  'diagram',
  'dog food',
  'iphone',
  'logo',
  'mac',
  'macintosh',
  'museum',
  'nasa',
  'poster',
  'screenshot',
  'store',
  'summit',
  'symbol',
  'typography',
  'vector',
]

const lowConfidenceTerms = [
  'abstract',
  'concept',
  'diagram',
  'illustration of text',
  'logo',
  'poster',
  'symbol',
  'typography',
  'vector',
]

const abstractSenseTerms = [
  'ability',
  'action',
  'chance',
  'condition',
  'feeling',
  'idea',
  'opportunity',
  'quality',
  'situation',
  'state',
]

const minimumRelevanceScore = 45
const visualStyleScores = {
  '3d': 30,
  cartoon: 35,
  character: 25,
  clipart: 20,
  educational: 18,
  illustration: 30,
  isolated: 20,
  portrait: 12,
  render: 24,
}
const unusableVisualTerms = [
  'architecture',
  'archive',
  'building history',
  'census',
  'chronicle',
  'conference',
  'diagram',
  'documentary',
  'historical',
  'infographic',
  'map',
  'newspaper',
  'painting',
  'poster',
  'scanned page',
  'statistics',
  'text heavy',
  'vintage',
  'yearbook',
]
const crowdedImageTerms = [
  'architecture',
  'building exterior',
  'crowd',
  'historical',
  'interior view',
  'street scene',
]

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isValidEnglishWord(word) {
  return /^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(word)
}

function normalizeUrl(value) {
  const url = cleanText(value)
  return url.startsWith('//') ? `https:${url}` : url
}

function normalizeSearchText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function buildMeaningContext(word, partOfSpeech, meaningEn) {
  const wordText = cleanText(word)
  const normalizedWord = normalizeSearchText(word)
  const normalizedMeaning = normalizeSearchText(meaningEn)
  const normalizedPos = normalizeSearchText(partOfSpeech)

  if (
    normalizedWord === 'bank' &&
    /\b(banking|financial|deposit|borrow|lend|money)\b/.test(normalizedMeaning)
  ) {
    return 'financial institution'
  }

  if (
    normalizedWord === 'school' ||
    /\b(school|educat\w*|student|teacher|classroom)\b/.test(normalizedMeaning)
  ) {
    return 'education'
  }

  if (
    normalizedWord === 'check' &&
    /\b(check|inspect|examine|verify|review)\b/.test(normalizedMeaning)
  ) {
    return 'inspection'
  }

  const ignoredWords = new Set([
    'and', 'are', 'for', 'from', 'into', 'that', 'the', 'this', 'to', 'with', wordText.toLowerCase(),
  ])
  const meaningWords = normalizeSearchText(meaningEn)
    .split(' ')
    .filter((term) => term.length > 2 && !ignoredWords.has(term))
    .slice(0, 3)

  if (meaningWords.length > 0) return meaningWords.join(' ')
  if (normalizedPos === 'verb') return 'action'
  return ''
}

function buildRelevanceTerms(word, meaningContext) {
  const normalizedWord = normalizeSearchText(word)
  const aliases = {
    apple: ['apples', 'fruit'],
    bank: ['finance', 'institution', 'money'],
    boy: ['boys', 'child', 'children', 'male'],
    child: ['boy', 'children', 'girl', 'kid'],
    bird: ['avian', 'birds'],
    cat: ['cats', 'feline', 'kitten'],
    dog: ['canine', 'dogs', 'puppy', 'retriever'],
    fish: ['fishes', 'goldfish'],
    girl: ['child', 'children', 'female', 'girls'],
    horse: ['equine', 'horses', 'pony'],
    man: ['male', 'men', 'person'],
    school: ['classroom', 'education', 'student'],
    woman: ['female', 'person', 'women'],
  }
  const wordAliases = aliases[normalizedWord] || []
  const contextTerms = normalizeSearchText(meaningContext)
    .split(' ')
    .filter((term) => term.length > 2)

  return [...new Set([
    ...searchForms(normalizedWord),
    ...wordAliases,
    ...(wordAliases.length === 0 ? contextTerms : []),
  ])]
}

function rotateItems(items, offset) {
  const startIndex = offset % items.length
  return [...items.slice(startIndex), ...items.slice(0, startIndex)]
}

function buildSearchStages(word, partOfSpeech, meaningEn, page) {
  const wordText = cleanText(word)
  const normalizedWord = normalizeSearchText(word)
  const meaningContext = buildMeaningContext(word, partOfSpeech, meaningEn)
  const humanWords = new Set(['boy', 'girl', 'man', 'woman', 'child'])
  const animalWords = new Set(['dog', 'cat', 'bird', 'horse', 'fish'])
  const specialQueries = {
    apple: [
      'apple 3d illustration',
      'apple cartoon',
      'apple isolated illustration',
      'apple educational illustration',
    ],
    boy: ['boy 3d cartoon', 'boy illustration', 'boy character', 'young boy cartoon'],
    girl: ['girl 3d cartoon', 'girl illustration', 'young girl character', 'girl cartoon'],
    school: [
      'school education 3d illustration',
      'school educational illustration',
      'school classroom cartoon',
      'school education cartoon',
    ],
  }
  const humanQueries = [
    `${wordText} 3d cartoon character`,
    `${wordText} illustration`,
    `${wordText} clean portrait illustration`,
    `${wordText} educational character`,
  ]
  const defaultQueries = [
    [wordText, meaningContext, '3d illustration'].filter(Boolean).join(' '),
    [wordText, meaningContext, 'cartoon'].filter(Boolean).join(' '),
    [wordText, meaningContext, 'isolated illustration'].filter(Boolean).join(' '),
    [wordText, meaningContext, 'educational illustration'].filter(Boolean).join(' '),
  ]
  if (normalizedWord === 'bank' && meaningContext === 'financial institution') {
    specialQueries.bank = [
      'bank financial institution 3d illustration',
      'bank cartoon building',
      'bank educational illustration',
      'bank financial institution cartoon',
    ]
  }

  const queries = specialQueries[normalizedWord] ||
    (humanWords.has(normalizedWord) ? humanQueries : defaultQueries)
  const rotatedQueries = rotateItems(queries, Math.max(0, page - 1))
  const focusedQueries = rotatedQueries.slice(0, 2).map((query) => ({
    kind: 'focused',
    query,
  }))
  const fallbackQueries = rotatedQueries.slice(2).map((query) => ({
    kind: 'focused',
    query,
  }))
  const concreteFallback = humanWords.has(normalizedWord)
    ? []
    : [{
        kind: 'broad',
        query: animalWords.has(normalizedWord)
          ? wordText
          : [wordText, meaningContext].filter(Boolean).join(' '),
      }]

  return {
    meaningTerms: normalizeSearchText(meaningContext).split(' ').filter(Boolean),
    relevanceTerms: buildRelevanceTerms(wordText, meaningContext),
    stages: [focusedQueries, fallbackQueries, concreteFallback],
    subjectType: humanWords.has(normalizedWord)
      ? 'human'
      : animalWords.has(normalizedWord) ? 'animal' : 'concrete',
  }
}

function isLikelyAbstract(word, meaningEn) {
  const normalizedWord = normalizeSearchText(word)
  const meaningWords = new Set(normalizeSearchText(meaningEn).split(' '))

  return normalizedWord === 'opportunity' || abstractSenseTerms.some((term) => meaningWords.has(term))
}

function searchForms(word) {
  const normalizedWord = normalizeSearchText(word)
  const forms = new Set([normalizedWord, `${normalizedWord}s`])

  if (normalizedWord.endsWith('y')) {
    forms.add(`${normalizedWord.slice(0, -1)}ies`)
  }

  return forms
}

function containsSearchWord(value, word) {
  const words = new Set(normalizeSearchText(value).split(' ').filter(Boolean))
  return [...searchForms(word)].some((form) => words.has(form))
}

function containsBlockedContent(value, word) {
  const normalizedValue = normalizeSearchText(value)
  const normalizedWord = normalizeSearchText(word)

  return blockedTerms.some(
    (term) => term !== normalizedWord && normalizedValue.includes(term),
  )
}

function containsIrrelevantContent(value, word) {
  const normalizedValue = normalizeSearchText(value)
  const normalizedWord = normalizeSearchText(word)

  return irrelevantTerms.some(
    (term) => term !== normalizedWord && normalizedValue.includes(term),
  )
}

function hasLowConfidenceTitle(value) {
  const normalizedValue = normalizeSearchText(value)
  return lowConfidenceTerms.some((term) => normalizedValue.includes(term))
}

function containsUnusableVisualContent(value) {
  const normalizedValue = normalizeSearchText(value)
  const words = new Set(normalizedValue.split(' ').filter(Boolean))

  return unusableVisualTerms.some((term) =>
    term.includes(' ') ? normalizedValue.includes(term) : words.has(term),
  )
}

function looksLikeArchiveRecord(value) {
  return (
    /\b(?:1[5-9]\d{2}|20\d{2})\b/.test(value) ||
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(value) ||
    /\b(?:first|second) bank of\b/i.test(value)
  )
}

function hasWrongWordSense(value, word, meaningEn) {
  const normalizedWord = normalizeSearchText(word)
  const normalizedMeaning = normalizeSearchText(meaningEn)
  const normalizedValue = normalizeSearchText(value)

  if (
    normalizedWord === 'bank' &&
    /\b(banking|financial|deposit|borrow|lend|money)\b/.test(normalizedMeaning)
  ) {
    return ['bank barrier', 'embankment', 'river bank', 'shore', 'west bank']
      .some((term) => normalizedValue.includes(term))
  }

  return false
}

function matchesRelevanceTerms(value, relevanceTerms = []) {
  const normalizedValue = normalizeSearchText(value)
  const words = new Set(normalizedValue.split(' ').filter(Boolean))

  return relevanceTerms.some((term) => {
    const normalizedTerm = normalizeSearchText(term)
    return normalizedTerm.includes(' ')
      ? normalizedValue.includes(normalizedTerm)
      : words.has(normalizedTerm)
  })
}

function scoreSuggestion(suggestion, word, index, metadata = {}, options = {}) {
  const normalizedTitle = normalizeSearchText(suggestion.title)
  const titleWords = normalizedTitle.split(' ').filter(Boolean)
  let score = Math.max(0, 20 - index) + (options.providerRankBoost || 0)

  const titleMatchesWord = containsSearchWord(normalizedTitle, word)
  const tagsMatchWord = metadata.tags?.some((tag) =>
    searchForms(word).has(normalizeSearchText(tag)),
  )
  const visualText = normalizeSearchText([suggestion.title, ...(metadata.tags || [])].join(' '))
  const matchesSubject = matchesRelevanceTerms(visualText, options.relevanceTerms)
  const titleMatchesMeaning = matchesRelevanceTerms(suggestion.title, options.meaningTerms)

  if (searchForms(word).has(normalizedTitle)) {
    score += 100
  } else if (titleMatchesWord) {
    score += 65
  }

  if (titleWords.length > 0 && titleWords.length <= 4) {
    score += 18
  }

  if (tagsMatchWord) score += 30
  if (titleMatchesMeaning) score += 28
  if (matchesSubject && !titleMatchesWord && !tagsMatchWord) score += 20

  if (metadata.category === 'illustration') score += 42
  if (metadata.category === 'photograph') {
    if (options.subjectType === 'animal') score += 12
    else if (options.subjectType === 'human') score -= 12
    else score += 5
  }

  for (const [term, points] of Object.entries(visualStyleScores)) {
    if (visualText.includes(term)) score += points
  }

  if (/\b(learning|teaching)\b/.test(visualText)) score += 14
  if (/\b(single subject|white background)\b/.test(visualText)) score += 10
  if (/\bsimple\b/.test(visualText)) score += 6
  if (/\bicon\b/.test(visualText)) score -= 8
  if (crowdedImageTerms.some((term) => visualText.includes(term))) score -= 30
  if (containsIrrelevantContent(visualText, word)) score -= 45

  if (metadata.width && metadata.height) {
    const shortSide = Math.min(metadata.width, metadata.height)
    const longSide = Math.max(metadata.width, metadata.height)
    if (shortSide < 240 || longSide < 320) score -= 35
    else if (shortSide >= 600 && longSide >= 800) score += 14
    else if (shortSide >= 360 && longSide >= 480) score += 8
  }

  if (metadata.mimetype && !metadata.mimetype.startsWith('image/')) score -= 30

  if (hasLowConfidenceTitle(suggestion.title)) score -= 35

  if (titleWords.length > 8) {
    score -= 15
  }

  if (!titleMatchesWord && titleWords.length > 5) score -= 12

  if (/\bof\s+[A-Z][\p{L}-]+/u.test(suggestion.title) && titleWords.length > 3) {
    score -= 80
  }

  return score
}

function selectSuggestions(candidates, word, options = {}) {
  const seenUrls = new Set()
  const seenTitles = new Set()

  return candidates
    .filter(({ suggestion, metadata }) => {
      if (!suggestion.image_url || !suggestion.thumbnail_url) {
        return false
      }

      if (
        (metadata.width && metadata.width < 120) ||
        (metadata.height && metadata.height < 120) ||
        (metadata.mimetype && !metadata.mimetype.startsWith('image/'))
      ) {
        return false
      }

      const searchableText = [suggestion.title, ...(metadata.tags || [])].join(' ')
      const normalizedTitle = normalizeSearchText(suggestion.title)

      if (
        containsBlockedContent(searchableText, word) ||
        containsUnusableVisualContent(searchableText) ||
        looksLikeArchiveRecord(suggestion.title) ||
        hasWrongWordSense(searchableText, word, options.meaningEn) ||
        (
          options.requireTitleRelevance !== false &&
          !matchesRelevanceTerms(suggestion.title, options.relevanceTerms)
        ) ||
        seenUrls.has(suggestion.image_url) ||
        seenTitles.has(normalizedTitle)
      ) {
        return false
      }

      seenUrls.add(suggestion.image_url)
      seenTitles.add(normalizedTitle)
      return true
    })
    .map((candidate) => ({
      ...candidate,
      strongWordMatch: containsSearchWord(candidate.suggestion.title, word),
      score: scoreSuggestion(
        candidate.suggestion,
        word,
        candidate.originalIndex,
        candidate.metadata,
        options,
      ),
    }))
    .sort((first, second) => second.score - first.score || first.originalIndex - second.originalIndex)
    .filter(({ score, strongWordMatch }) => {
      const threshold = strongWordMatch
        ? 35
        : options.minimumScore ?? (options.isAbstract ? 55 : minimumRelevanceScore)
      return score >= threshold
    })
    .slice(0, maximumSuggestions)
    .map(({ suggestion }) => suggestion)
}

function buildPexelsQuery(word, context) {
  const normalizedWord = normalizeSearchText(word)

  if (
    normalizedWord === 'bank' &&
    /\b(banking|financial|deposit|borrow|lend|money)\b/.test(normalizeSearchText(context.meaningEn))
  ) {
    return 'bank financial institution'
  }

  if (normalizedWord === 'school') return 'school education students'
  if (context.subjectType === 'human') return `${word} simple portrait`
  if (context.subjectType === 'animal') return `${word} animal portrait`
  if (normalizedWord === 'apple') return 'apple fruit isolated'

  return [word, ...(context.meaningTerms || []).slice(0, 2), 'simple']
    .filter(Boolean)
    .join(' ')
}

export function parsePexelsResponse(providerResponse, word, context = {}) {
  if (!providerResponse || !Array.isArray(providerResponse.photos)) {
    return null
  }

  const candidates = providerResponse.photos.map((photo, originalIndex) => {
    const title = cleanText(photo.alt) || `${word} photo`

    return {
      originalIndex,
      metadata: {
        category: 'photograph',
        tags: [title],
        width: Number(photo.width) || 0,
        height: Number(photo.height) || 0,
        mimetype: 'image/jpeg',
      },
      suggestion: {
        id: String(photo.id || ''),
        thumbnail_url: normalizeUrl(photo.src?.medium || photo.src?.small),
        image_url: normalizeUrl(photo.src?.large || photo.src?.large2x || photo.src?.original),
        title,
        creator: cleanText(photo.photographer),
        source: 'pexels',
        license: 'Pexels License',
      },
    }
  })

  return selectSuggestions(candidates, word, {
    isAbstract: isLikelyAbstract(word, context.meaningEn),
    meaningEn: context.meaningEn,
    meaningTerms: context.meaningTerms,
    minimumScore: 30,
    providerRankBoost: 20,
    relevanceTerms: context.relevanceTerms,
    requireTitleRelevance: false,
    subjectType: context.subjectType,
  })
}

function formatOpenverseLicense(item) {
  const license = cleanText(item.license).toUpperCase()
  const version = cleanText(item.license_version)

  if (!license) {
    return ''
  }

  if (license === 'PDM') {
    return 'Public Domain Mark'
  }

  if (license === 'CC0') {
    return 'CC0'
  }

  return `CC ${license}${version ? ` ${version}` : ''}`
}

export function parseOpenverseResponse(providerResponse, word, context = {}) {
  if (!providerResponse || !Array.isArray(providerResponse.results)) {
    return null
  }

  const candidates = providerResponse.results.map((item, originalIndex) => ({
    originalIndex,
    metadata: {
      category: cleanText(item.category).toLowerCase(),
      tags: Array.isArray(item.tags) ? item.tags.map((tag) => cleanText(tag?.name)).filter(Boolean) : [],
      width: Number(item.width) || 0,
      height: Number(item.height) || 0,
      mimetype: cleanText(item.mimetype).toLowerCase(),
    },
    suggestion: {
      id: cleanText(item.id),
      thumbnail_url: normalizeUrl(item.thumbnail || item.url),
      image_url: normalizeUrl(item.url),
      title: cleanText(item.title) || word,
      creator: cleanText(item.creator),
      source: 'openverse',
      license: formatOpenverseLicense(item),
    },
  }))

  return selectSuggestions(candidates, word, {
    isAbstract: isLikelyAbstract(word, context.meaningEn),
    meaningEn: context.meaningEn,
    meaningTerms: context.meaningTerms,
    relevanceTerms: context.relevanceTerms,
    subjectType: context.subjectType,
  })
}

function decodeHtml(value) {
  return cleanText(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (match, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (match, number) => String.fromCodePoint(Number.parseInt(number, 16)))
    .replace(/\s+/g, ' ')
    .trim()
}

function wikimediaMetadataValue(metadata, key) {
  return decodeHtml(metadata?.[key]?.value)
}

function cleanWikimediaTitle(value) {
  return cleanText(value)
    .replace(/^File:/i, '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/_/g, ' ')
    .trim()
}

export function parseWikimediaResponse(providerResponse, word, context = {}) {
  if (!providerResponse || typeof providerResponse !== 'object' || Array.isArray(providerResponse)) {
    return null
  }

  if (!providerResponse.query && 'batchcomplete' in providerResponse) {
    return []
  }

  if (!providerResponse.query || typeof providerResponse.query !== 'object') {
    return null
  }

  const pages = Array.isArray(providerResponse.query.pages) ? providerResponse.query.pages : []
  const candidates = pages.map((page, originalIndex) => {
    const imageInfo = Array.isArray(page.imageinfo) ? page.imageinfo[0] : null
    const metadata = imageInfo?.extmetadata || {}
    const title = cleanWikimediaTitle(page.title) || word

    return {
      originalIndex,
      metadata: {
        tags: [],
        width: Number(imageInfo?.width) || 0,
        height: Number(imageInfo?.height) || 0,
        mimetype: cleanText(imageInfo?.mime).toLowerCase(),
      },
      suggestion: {
        id: String(page.pageid || cleanText(page.title)),
        thumbnail_url: normalizeUrl(imageInfo?.thumburl || imageInfo?.url),
        image_url: normalizeUrl(imageInfo?.url),
        title,
        creator: wikimediaMetadataValue(metadata, 'Artist') || cleanText(imageInfo?.user),
        source: 'wikimedia_commons',
        license:
          wikimediaMetadataValue(metadata, 'LicenseShortName') ||
          wikimediaMetadataValue(metadata, 'UsageTerms'),
      },
    }
  })

  return selectSuggestions(candidates, word, {
    isAbstract: isLikelyAbstract(word, context.meaningEn),
    meaningEn: context.meaningEn,
    meaningTerms: context.meaningTerms,
    relevanceTerms: context.relevanceTerms,
    subjectType: context.subjectType,
  })
}

const providers = [
  {
    name: 'Pexels',
    buildSearchStages(word, context) {
      return [[{
        kind: 'photo',
        query: buildPexelsQuery(word, context),
      }]]
    },
    buildUrl(word, context) {
      const url = new URL('https://api.pexels.com/v1/search')
      url.searchParams.set('query', context.query)
      url.searchParams.set('per_page', '20')
      url.searchParams.set('page', String(context.page))
      url.searchParams.set('size', 'medium')
      return url
    },
    headers() {
      const apiKey = cleanText(process.env.PEXELS_API_KEY)
      if (!apiKey) return null

      return {
        Accept: 'application/json',
        Authorization: apiKey,
      }
    },
    parse: parsePexelsResponse,
  },
  {
    name: 'Openverse',
    buildUrl(word, context) {
      const url = new URL('https://api.openverse.org/v1/images/')
      url.searchParams.set('q', context.query)
      url.searchParams.set('page_size', '20')
      url.searchParams.set('page', '1')
      url.searchParams.set('mature', 'false')
      url.searchParams.set(
        'category',
        context.kind === 'focused' ? 'illustration' : 'photograph,illustration',
      )
      return url
    },
    headers: {
      Accept: 'application/json',
      'User-Agent': 'EnglishFlashcardAssistant/2.0',
    },
    parse: parseOpenverseResponse,
  },
  {
    name: 'Wikimedia Commons',
    buildUrl(word, context) {
      const url = new URL('https://commons.wikimedia.org/w/api.php')
      const parameters = {
        action: 'query',
        format: 'json',
        formatversion: '2',
        generator: 'search',
        gsrsearch: `${context.query} filetype:bitmap`,
        gsrnamespace: '6',
        gsrlimit: '20',
        gsroffset: '0',
        gsrsort: 'relevance',
        prop: 'imageinfo',
        iiprop: 'url|mime|extmetadata',
        iiurlwidth: '360',
        iiextmetadatafilter: 'Artist|LicenseShortName|UsageTerms',
        iiextmetadatalanguage: 'en',
      }

      for (const [key, value] of Object.entries(parameters)) {
        url.searchParams.set(key, value)
      }

      return url
    },
    headers: {
      Accept: 'application/json',
      'User-Agent': 'EnglishFlashcardAssistant/2.0 (personal vocabulary learning project)',
    },
    parse: parseWikimediaResponse,
  },
]

function providerFailure(provider, reason) {
  console.warn(`[images] ${provider.name} failed: ${reason}`)
  return { type: 'failed' }
}

async function searchProvider(provider, word, context) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMilliseconds)
  const headers = typeof provider.headers === 'function'
    ? provider.headers()
    : provider.headers

  if (!headers) {
    clearTimeout(timeoutId)
    return providerFailure(provider, 'missing PEXELS_API_KEY')
  }

  try {
    const externalResponse = await fetch(provider.buildUrl(word, context), {
      headers,
      signal: controller.signal,
    })

    if (!externalResponse.ok) {
      return providerFailure(provider, `HTTP ${externalResponse.status}`)
    }

    let providerResponse

    try {
      providerResponse = await externalResponse.json()
    } catch {
      return providerFailure(provider, 'invalid JSON response')
    }

    let suggestions

    try {
      suggestions = provider.parse(providerResponse, word, context)
    } catch (error) {
      return providerFailure(provider, `malformed response: ${error.message}`)
    }

    if (!suggestions) {
      return providerFailure(provider, 'malformed response')
    }

    return { type: 'success', data: suggestions }
  } catch (error) {
    if (error.name === 'AbortError') {
      return providerFailure(provider, `timed out after ${requestTimeoutMilliseconds}ms`)
    }

    return providerFailure(provider, `network error: ${error.message}`)
  } finally {
    clearTimeout(timeoutId)
  }
}

function mergeSuggestions(currentSuggestions, newSuggestions) {
  const seenImages = new Set(
    currentSuggestions.map((suggestion) => suggestion.image_url || suggestion.id),
  )
  const merged = [...currentSuggestions]

  for (const suggestion of newSuggestions) {
    const identity = suggestion.image_url || suggestion.id
    if (!identity || seenImages.has(identity)) continue

    seenImages.add(identity)
    merged.push(suggestion)
  }

  return merged.slice(0, maximumSuggestions)
}

async function searchProviderStages(provider, word, context, searchStages) {
  let suggestions = []
  let receivedValidResponse = false
  const providerSearchStages = provider.buildSearchStages
    ? provider.buildSearchStages(word, context)
    : searchStages

  for (const stage of providerSearchStages) {
    for (const search of stage) {
      const result = await searchProvider(provider, word, { ...context, ...search })

      if (result.type === 'failed') {
        return receivedValidResponse
          ? { type: 'success', data: suggestions }
          : result
      }

      receivedValidResponse = true
      suggestions = mergeSuggestions(suggestions, result.data)

      if (suggestions.length >= maximumSuggestions) {
        return { type: 'success', data: suggestions }
      }
    }
  }

  return { type: 'success', data: suggestions }
}

router.get('/:word', async (request, response) => {
  const word = cleanText(request.params.word)
  const partOfSpeech = cleanText(request.query.part_of_speech).slice(0, 40)
  const meaningEn = cleanText(request.query.meaning_en).slice(0, 240)
  const requestedPage = Number.parseInt(request.query.page, 10)
  const page = Number.isInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, 5)
    : 1

  if (!word || word.length > 80 || !isValidEnglishWord(word)) {
    return response.status(400).json({
      error: 'Please provide one valid English word using letters, apostrophes, or hyphens.',
    })
  }

  const context = {
    page,
    partOfSpeech,
    meaningEn,
  }
  const searchPlan = buildSearchStages(word, partOfSpeech, meaningEn, page)
  context.meaningTerms = searchPlan.meaningTerms
  context.relevanceTerms = searchPlan.relevanceTerms
  context.subjectType = searchPlan.subjectType
  const searchStages = searchPlan.stages
  let suggestions = []
  let providerWasAvailable = false

  for (const provider of providers) {
    const result = await searchProviderStages(provider, word, context, searchStages)

    if (result.type === 'success') {
      providerWasAvailable = true
      suggestions = mergeSuggestions(suggestions, result.data)

      if (suggestions.length >= maximumSuggestions) {
        return response.json(suggestions)
      }
    }
  }

  if (providerWasAvailable) {
    return response.json(suggestions)
  }

  return response.status(503).json({
    error: 'Image services are currently unavailable. Please try again later.',
  })
})

export default router
