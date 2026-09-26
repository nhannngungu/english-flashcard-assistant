const vocabularyApiUrl = '/api/vocabularies'

async function readJson(response) {
  if (response.status === 204) {
    return null
  }

  let data

  try {
    data = await response.json()
  } catch {
    throw new Error(`The server returned an unexpected response (${response.status}).`)
  }

  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.')
    error.status = response.status
    throw error
  }

  return data
}

async function request(url, options) {
  try {
    const response = await fetch(url, options)
    return readJson(response)
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Unable to reach the server. Check that the backend is running.')
    }

    throw error
  }
}

export function getVocabularies() {
  return request(vocabularyApiUrl)
}

export function getSmartReviewCards() {
  return request(`${vocabularyApiUrl}/review/smart`)
}

export function rateVocabularyReview(id, rating) {
  return request(`${vocabularyApiUrl}/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating }),
  })
}

export function createVocabulary(vocabulary) {
  return request(vocabularyApiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vocabulary),
  })
}

export function updateVocabulary(id, vocabulary) {
  return request(`${vocabularyApiUrl}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vocabulary),
  })
}

export function deleteVocabulary(id) {
  return request(`${vocabularyApiUrl}/${id}`, {
    method: 'DELETE',
  })
}

export function updateVocabularyStatus(id, status) {
  return request(`${vocabularyApiUrl}/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
}

export function normalizeVocabularyLookup(value) {
  const normalizedValue = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  const leadingBulletPattern = /^(?:[-–—•*·])+\s*/u
  const trailingBulletPattern = /\s*(?:[-–—•*·])+$/u

  return normalizedValue
    .replace(leadingBulletPattern, '')
    .replace(trailingBulletPattern, '')
    .trim()
}

export function lookupDictionary(word) {
  const normalizedWord = normalizeVocabularyLookup(word)
  return request(`/api/dictionary/${encodeURIComponent(normalizedWord)}`)
}

export function lookupImages(word, { partOfSpeech = '', meaningEn = '', page = 1 } = {}) {
  const query = new URLSearchParams({
    part_of_speech: partOfSpeech,
    meaning_en: meaningEn,
    page: String(page),
  })

  return request(`/api/images/${encodeURIComponent(word.trim())}?${query}`)
}
