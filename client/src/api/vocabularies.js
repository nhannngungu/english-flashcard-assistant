import { apiRequest } from './client.js'

export const getVocabularies = () => apiRequest('vocabularies')
export const getSmartReviewCards = () => apiRequest('vocabularies/review/smart')
export const rateVocabularyReview = (id, rating) => apiRequest(`vocabularies/${id}/review`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating }),
})
export const createVocabulary = (vocabulary) => apiRequest('vocabularies', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vocabulary),
})
export const updateVocabulary = (id, vocabulary) => apiRequest(`vocabularies/${id}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vocabulary),
})
export const deleteVocabulary = (id) => apiRequest(`vocabularies/${id}`, { method: 'DELETE' })
export const updateVocabularyStatus = (id, status) => apiRequest(`vocabularies/${id}/status`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
})

export function normalizeVocabularyLookup(value) {
  const normalizedValue = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  return normalizedValue.replace(/^(?:[-–—•*·])+\s*/u, '').replace(/\s*(?:[-–—•*·])+$/u, '').trim()
}

export function lookupDictionary(word) {
  return apiRequest(`dictionary/${encodeURIComponent(normalizeVocabularyLookup(word))}`, {}, { authenticated: false })
}

export function lookupImages(word, { partOfSpeech = '', meaningEn = '', page = 1 } = {}) {
  const query = new URLSearchParams({ part_of_speech: partOfSpeech, meaning_en: meaningEn, page: String(page) })
  return apiRequest(`images/${encodeURIComponent(word.trim())}?${query}`, {}, { authenticated: false })
}
