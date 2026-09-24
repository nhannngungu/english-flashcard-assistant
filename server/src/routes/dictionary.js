import { Router } from 'express'

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

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isValidEnglishWord(word) {
  return /^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(word)
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

function findPrimaryFreeDictionaryApiSense(senses) {
  if (!Array.isArray(senses)) {
    return null
  }

  for (const sense of senses) {
    if (cleanText(sense.definition)) {
      return sense
    }

    const nestedSense = findPrimaryFreeDictionaryApiSense(sense.subsenses)

    if (nestedSense) {
      return nestedSense
    }
  }

  return null
}

export function parseFreeDictionaryApiResponse(providerResponse, requestedWord) {
  if (!providerResponse || typeof providerResponse !== 'object' || Array.isArray(providerResponse)) {
    return null
  }

  const entries = Array.isArray(providerResponse.entries) ? providerResponse.entries : []

  for (const entry of entries) {
    const primarySense = findPrimaryFreeDictionaryApiSense(entry.senses)

    if (!primarySense) {
      continue
    }

    const pronunciations = entries.flatMap((item) =>
      Array.isArray(item.pronunciations) ? item.pronunciations : [],
    )
    const phoneticEntry =
      pronunciations.find((item) => item.type === 'ipa' && cleanText(item.text)) ||
      pronunciations.find((item) => cleanText(item.text))
    const audioEntry = pronunciations.find(
      (item) => cleanText(item.audio) || cleanText(item.audioUrl) || cleanText(item.audio_url),
    )

    return {
      word: cleanText(providerResponse.word) || requestedWord,
      phonetic: cleanText(phoneticEntry?.text),
      audio_url: normalizeAudioUrl(audioEntry?.audio || audioEntry?.audioUrl || audioEntry?.audio_url),
      part_of_speech: cleanText(entry.partOfSpeech),
      meaning: cleanText(primarySense.definition),
      example: firstExample(primarySense.examples),
      source: providers[0].name,
    }
  }

  return null
}

export function parseSuvankarResponse(providerResponse, requestedWord) {
  const entry = Array.isArray(providerResponse) ? providerResponse[0] : providerResponse

  if (!entry || typeof entry !== 'object') {
    return null
  }

  const meanings = Array.isArray(entry.meanings) ? entry.meanings : []

  for (const meaning of meanings) {
    const senses = Array.isArray(meaning.senses) ? meaning.senses : []

    for (const sense of senses) {
      const definition = firstExample(sense.glosses) || cleanText(sense.definition)

      if (!definition) {
        continue
      }

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

      return {
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
        part_of_speech: cleanText(meaning.partOfSpeech),
        meaning: definition,
        example: firstExample(sense.examples ?? sense.example),
        source: providers[1].name,
      }
    }
  }

  return null
}

export function parseDictionaryApiDevResponse(entries, requestedWord) {
  if (!Array.isArray(entries)) {
    return null
  }

  for (const entry of entries) {
    const meanings = Array.isArray(entry.meanings) ? entry.meanings : []

    for (const meaning of meanings) {
      const definitions = Array.isArray(meaning.definitions) ? meaning.definitions : []
      const primaryDefinition = definitions.find((definition) => cleanText(definition.definition))

      if (!primaryDefinition) {
        continue
      }

      const phonetics = Array.isArray(entry.phonetics) ? entry.phonetics : []
      const phoneticEntry = phonetics.find((item) => cleanText(item.text))
      const audioEntry = phonetics.find((item) => cleanText(item.audio))

      return {
        word: cleanText(entry.word) || requestedWord,
        phonetic: cleanText(entry.phonetic) || cleanText(phoneticEntry?.text),
        audio_url: normalizeAudioUrl(audioEntry?.audio),
        part_of_speech: cleanText(meaning.partOfSpeech),
        meaning: cleanText(primaryDefinition.definition),
        example: cleanText(primaryDefinition.example),
        source: providers[2].name,
      }
    }
  }

  return null
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

router.get('/:word', async (request, response) => {
  const word = cleanText(request.params.word)

  if (!word || word.length > 80 || !isValidEnglishWord(word)) {
    return response.status(400).json({
      error: 'Please provide one valid English word using letters, apostrophes, or hyphens.',
    })
  }

  for (const provider of providers) {
    const result = await lookupProvider(provider, word)

    if (result.type === 'success') {
      return response.json(result.data)
    }

    if (result.type === 'not-found') {
      return response.status(404).json({ error: `No dictionary entry was found for “${word}”.` })
    }
  }

  return response.status(503).json({
    error: 'Dictionary services are currently unavailable. Please try again later.',
  })
})

export default router
