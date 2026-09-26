import { Router } from 'express'
import {
  cleanLearnerDefinition,
  selectFreeDictionaryApiCandidates,
  selectLearnerDefinitionCandidates,
} from '../services/definitionSelection.js'
import { translateEnglishToVietnamese } from '../services/translation.js'
import { normalizeOcrVocabularyWord, normalizeVocabularyPhrase } from '../services/vocabularyNormalization.js'

const router = Router()
const requestTimeoutMilliseconds = 8000

const providers = [
  {
    name: 'freedictionaryapi.com',
    buildUrl: (word) => `https://freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(word)}`,
    isNotFound: (providerResponse) =>
      providerResponse && Array.isArray(providerResponse.entries) && providerResponse.entries.length === 0,
    parse: parseFreeDictionaryApiResponse,
  },
  {
    name: 'api.suvankar.cc',
    buildUrl: (word) =>
      `https://api.suvankar.cc/dictionaryapi/v1/definitions/en/${encodeURIComponent(word)}?compact=true`,
    parse: parseSuvankarResponse,
  },
  {
    name: 'dictionaryapi.dev',
    buildUrl: (word) => `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    parse: parseDictionaryApiDevResponse,
  },
]
const dictionaryMergeFields = ['phonetic', 'audio_url', 'part_of_speech', 'meaning_en', 'example']
const requiredDictionaryFields = ['phonetic', 'part_of_speech', 'meaning_en', 'example']

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeLookupVocabulary(value) {
  return normalizeOcrVocabularyWord(normalizeVocabularyPhrase(value)).value
}

export function isValidEnglishVocabulary(value) {
  return /^[A-Za-z]+(?:[ '\u2019-][A-Za-z]+)*$/.test(value)
}

function normalizeAudioUrl(value) {
  const audioUrl = cleanText(value)

  if (audioUrl.startsWith('//')) {
    return `https:${audioUrl}`
  }

  return audioUrl
}

function firstExample(value) {
  if (Array.isArray(value)) {
    for (const example of value) {
      const exampleText = cleanText(example) || cleanText(example?.text)

      if (exampleText) {
        return exampleText
      }
    }

    return ''
  }

  return cleanText(value)
}

function selectExampleFromCandidates(candidates, selectedCandidate) {
  const selectedPartOfSpeech = cleanText(selectedCandidate?.partOfSpeech).toLowerCase()
  const samePartOfSpeech = selectedPartOfSpeech
    ? candidates.filter((candidate) =>
      cleanText(candidate.partOfSpeech).toLowerCase() === selectedPartOfSpeech,
    )
    : []
  const orderedCandidates = [selectedCandidate, ...samePartOfSpeech, ...candidates].filter(Boolean)
  const seenExamples = new Set()

  for (const candidate of orderedCandidates) {
    const example = cleanText(candidate.example)
    const normalizedExample = example.toLowerCase()

    if (example && !seenExamples.has(normalizedExample)) {
      seenExamples.add(normalizedExample)
      return example
    }
  }

  return ''
}

function hasUsefulDictionaryData(entry) {
  return ['phonetic', 'audio_url', 'part_of_speech', 'meaning_en', 'example']
    .some((field) => cleanText(entry?.[field]))
}

function collectFreeDictionaryExampleCandidates(entries) {
  const candidates = []

  const collectSenses = (senses, partOfSpeech) => {
    for (const sense of Array.isArray(senses) ? senses : []) {
      candidates.push({
        definition: cleanText(sense.definition),
        example: firstExample(sense.examples ?? sense.example),
        partOfSpeech,
      })
      collectSenses(sense.subsenses ?? sense.subSenses, partOfSpeech)
    }
  }

  for (const entry of Array.isArray(entries) ? entries : []) {
    collectSenses(entry.senses, cleanText(entry.partOfSpeech))
  }

  return candidates
}

export function parseFreeDictionaryApiResponse(providerResponse, requestedWord) {
  if (!providerResponse || typeof providerResponse !== 'object' || Array.isArray(providerResponse)) {
    return null
  }

  const entries = Array.isArray(providerResponse.entries) ? providerResponse.entries : []
  const definitionCandidates = selectFreeDictionaryApiCandidates(entries, Number.MAX_SAFE_INTEGER)
  const [primaryDefinition] = definitionCandidates
  const exampleCandidates = collectFreeDictionaryExampleCandidates(entries)

  const pronunciations = entries.flatMap((item) =>
    Array.isArray(item.pronunciations) ? item.pronunciations : [],
  )
  const phoneticEntry =
    pronunciations.find((item) => item.type === 'ipa' && cleanText(item.text)) ||
    pronunciations.find((item) => cleanText(item.text))
  const audioEntry = pronunciations.find(
    (item) => cleanText(item.audio) || cleanText(item.audioUrl) || cleanText(item.audio_url),
  )

  const entry = {
    word: cleanText(providerResponse.word) || requestedWord,
    phonetic: cleanText(phoneticEntry?.text),
    audio_url: normalizeAudioUrl(audioEntry?.audio || audioEntry?.audioUrl || audioEntry?.audio_url),
    part_of_speech: cleanText(primaryDefinition?.partOfSpeech),
    meaning_en: cleanText(primaryDefinition?.definition),
    reference_word: cleanText(primaryDefinition?.referenceWord),
    example: selectExampleFromCandidates(
      [...definitionCandidates, ...exampleCandidates],
      primaryDefinition,
    ),
    source: providers[0].name,
  }

  return hasUsefulDictionaryData(entry) ? entry : null
}

export function parseSuvankarResponse(providerResponse, requestedWord) {
  const entry = Array.isArray(providerResponse) ? providerResponse[0] : providerResponse

  if (!entry || typeof entry !== 'object') {
    return null
  }

  const meanings = Array.isArray(entry.meanings) ? entry.meanings : []
  const candidates = []

  const collectSenses = (senses, partOfSpeech) => {
    for (const sense of Array.isArray(senses) ? senses : []) {
      candidates.push({
        definition: firstExample(sense.glosses) || cleanText(sense.definition),
        example: firstExample(sense.examples ?? sense.example),
        partOfSpeech,
      })
      collectSenses(sense.subsenses ?? sense.subSenses, partOfSpeech)
    }
  }

  for (const meaning of meanings) {
    collectSenses(meaning.senses, cleanText(meaning.partOfSpeech))
  }

  const rankedCandidates = selectLearnerDefinitionCandidates(candidates, Number.MAX_SAFE_INTEGER)
  const [primaryDefinition] = rankedCandidates
  const pronunciations = [
    ...(Array.isArray(entry.pronunciations) ? entry.pronunciations : []),
    ...(Array.isArray(entry.phonetics) ? entry.phonetics : []),
    ...(Array.isArray(entry.sounds) ? entry.sounds : []),
  ]
  const phoneticEntry = pronunciations.find(
    (item) => cleanText(item.ipa) || cleanText(item.text) || cleanText(item.phonetic),
  )
  const audioEntry = pronunciations.find(
    (item) => cleanText(item.audio) || cleanText(item.audioUrl) || cleanText(item.audio_url),
  )
  const parsedEntry = {
    word: cleanText(entry.word) || requestedWord,
    phonetic:
      cleanText(entry.ipa) ||
      cleanText(entry.phonetic) ||
      cleanText(phoneticEntry?.ipa) ||
      cleanText(phoneticEntry?.text) ||
      cleanText(phoneticEntry?.phonetic),
    audio_url: normalizeAudioUrl(
      entry.audioUrl || entry.audio_url || entry.audio || audioEntry?.audio || audioEntry?.audioUrl || audioEntry?.audio_url,
    ),
    part_of_speech: cleanText(primaryDefinition?.partOfSpeech),
    meaning_en: cleanText(primaryDefinition?.definition),
    reference_word: cleanText(primaryDefinition?.referenceWord),
    example: selectExampleFromCandidates(candidates, primaryDefinition) || firstExample(entry.examples),
    source: providers[1].name,
  }

  return hasUsefulDictionaryData(parsedEntry) ? parsedEntry : null
}

export function parseDictionaryApiDevResponse(entries, requestedWord) {
  if (!Array.isArray(entries)) {
    return null
  }

  const candidates = []

  for (const entry of entries) {
    const meanings = Array.isArray(entry.meanings) ? entry.meanings : []

    for (const meaning of meanings) {
      const definitions = Array.isArray(meaning.definitions) ? meaning.definitions : []

      for (const definition of definitions) {
        candidates.push({
          definition: cleanText(definition.definition),
          entry,
          example: firstExample(definition.examples ?? definition.example),
          partOfSpeech: cleanText(meaning.partOfSpeech),
        })
      }
    }
  }

  const rankedCandidates = selectLearnerDefinitionCandidates(candidates, Number.MAX_SAFE_INTEGER)
  const [primaryDefinition] = rankedCandidates
  const primaryEntry = primaryDefinition?.entry || entries[0] || {}
  const phonetics = Array.isArray(primaryEntry.phonetics) ? primaryEntry.phonetics : []
  const phoneticEntry = phonetics.find((item) => cleanText(item.text))
  const audioEntry = phonetics.find((item) => cleanText(item.audio))
  const parsedEntry = {
    word: cleanText(primaryEntry.word) || requestedWord,
    phonetic: cleanText(primaryEntry.phonetic) || cleanText(phoneticEntry?.text),
    audio_url: normalizeAudioUrl(audioEntry?.audio),
    part_of_speech: cleanText(primaryDefinition?.partOfSpeech),
    meaning_en: cleanText(primaryDefinition?.definition),
    reference_word: cleanText(primaryDefinition?.referenceWord),
    example: selectExampleFromCandidates(candidates, primaryDefinition),
    source: providers[2].name,
  }

  return hasUsefulDictionaryData(parsedEntry) ? parsedEntry : null
}

function providerFailure(provider, reason) {
  console.warn(`[dictionary] ${provider.name} failed: ${reason}`)
  return { type: 'failed' }
}

async function lookupProvider(provider, word) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMilliseconds)

  try {
    const externalResponse = await fetch(provider.buildUrl(word), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    if (externalResponse.status === 404) {
      return { type: 'not-found' }
    }

    if (!externalResponse.ok) {
      return providerFailure(provider, `HTTP ${externalResponse.status}`)
    }

    let providerResponse

    try {
      providerResponse = await externalResponse.json()
    } catch {
      return providerFailure(provider, 'invalid JSON response')
    }

    if (provider.isNotFound?.(providerResponse)) {
      return { type: 'not-found' }
    }

    const dictionaryEntry = provider.parse(providerResponse, word)

    if (!dictionaryEntry) {
      return providerFailure(provider, 'response contained no usable definition')
    }

    return { type: 'success', data: dictionaryEntry }
  } catch (error) {
    if (error.name === 'AbortError') {
      return providerFailure(provider, `timed out after ${requestTimeoutMilliseconds}ms`)
    }

    return providerFailure(provider, `network error: ${error.message}`)
  } finally {
    clearTimeout(timeoutId)
  }
}

export function mergeDictionaryEntries(currentEntry, incomingEntry) {
  const mergedEntry = { ...currentEntry }

  for (const field of dictionaryMergeFields) {
    const incomingValue = cleanText(incomingEntry?.[field])

    if (field === 'meaning_en' && cleanText(incomingEntry?.reference_word)) {
      continue
    }

    if (!cleanText(mergedEntry[field]) && incomingValue) {
      mergedEntry[field] = incomingValue
    }
  }

  const source = cleanText(incomingEntry?.source)
  const currentSources = Array.isArray(currentEntry.sources) ? currentEntry.sources : []
  mergedEntry.sources = source ? [...new Set([...currentSources, source])] : currentSources
  mergedEntry.source = cleanText(currentEntry.source) || source
  const referenceWord = cleanText(incomingEntry?.reference_word)
  const currentReferences = Array.isArray(currentEntry.reference_words) ? currentEntry.reference_words : []
  mergedEntry.reference_words = referenceWord
    ? [...new Set([...currentReferences, referenceWord])]
    : currentReferences

  return mergedEntry
}

function missingDictionaryFields(entry) {
  return requiredDictionaryFields.filter((field) => !cleanText(entry[field]))
}

export async function lookupDictionaryProviders(word, { followReferences = true } = {}) {
  let aggregate = {
    word,
    phonetic: '',
    audio_url: '',
    part_of_speech: '',
    meaning_en: '',
    example: '',
    source: '',
    sources: [],
    reference_words: [],
  }
  let foundEntry = false
  let sawNotFound = false

  for (const provider of providers) {
    const result = await lookupProvider(provider, word)

    if (result.type === 'success') {
      foundEntry = true
      aggregate = mergeDictionaryEntries(aggregate, result.data)

      if (missingDictionaryFields(aggregate).length === 0) break
    } else if (result.type === 'not-found') {
      sawNotFound = true
    }
  }

  if (followReferences && !cleanText(aggregate.meaning_en)) {
    for (const referenceWord of aggregate.reference_words) {
      if (referenceWord.toLowerCase() === word.toLowerCase()) continue

      const referencedResult = await lookupDictionaryProviders(referenceWord, { followReferences: false })

      if (referencedResult.type === 'success') {
        aggregate = mergeDictionaryEntries(aggregate, referencedResult.data)
      }

      if (cleanText(aggregate.meaning_en)) break
    }
  }

  if (foundEntry) return { type: 'success', data: aggregate }
  if (sawNotFound) return { type: 'not-found' }
  return { type: 'unavailable' }
}

export async function addVietnameseMeaning(dictionaryEntry) {
  const meaningEn = cleanLearnerDefinition(dictionaryEntry.meaning_en).definition
  const translation = await translateEnglishToVietnamese(meaningEn)
  const unavailableFields = missingDictionaryFields({ ...dictionaryEntry, meaning_en: meaningEn })

  if (!translation.meaningVi) unavailableFields.push('meaning_vi')

  return {
    word: dictionaryEntry.word,
    phonetic: dictionaryEntry.phonetic,
    audio_url: dictionaryEntry.audio_url,
    part_of_speech: dictionaryEntry.part_of_speech,
    meaning_en: meaningEn,
    meaning_vi: translation.meaningVi,
    example: dictionaryEntry.example,
    source: dictionaryEntry.source,
    sources: dictionaryEntry.sources,
    translation_source: translation.source,
    unavailable_fields: unavailableFields,
  }
}

router.get('/:word', async (request, response) => {
  const word = normalizeLookupVocabulary(request.params.word)

  if (!word || word.length > 80 || !isValidEnglishVocabulary(word)) {
    return response.status(400).json({
      error: 'Please provide a valid English word or phrase using letters, spaces, apostrophes, or hyphens.',
    })
  }

  const result = await lookupDictionaryProviders(word)

  if (result.type === 'success') {
    const enrichedEntry = await addVietnameseMeaning(result.data)
    return response.json(enrichedEntry)
  }

  if (result.type === 'not-found') {
    return response.status(404).json({ error: `No dictionary entry was found for “${word}”.` })
  }

  return response.status(503).json({
    error: 'Dictionary services are currently unavailable. Please try again later.',
  })
})

export default router
