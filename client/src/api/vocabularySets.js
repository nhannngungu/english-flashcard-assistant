import { apiRequest } from './client.js'

export const getVocabularySets = (page = 1) => apiRequest(`vocabulary-sets?page=${encodeURIComponent(page)}`)

export async function getAllVocabularySets() {
  const firstPage = await getVocabularySets(1)
  const pages = [firstPage]
  for (let page = 2; page <= firstPage.total_pages; page += 1) pages.push(await getVocabularySets(page))
  return pages.flatMap((result) => result.items)
}

export const getVocabularySet = (id) => apiRequest(`vocabulary-sets/${encodeURIComponent(id)}`)
export const createVocabularySet = ({ title = '', cover_image_url = '' } = {}) => apiRequest('vocabulary-sets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title, cover_image_url, timezone_offset_minutes: new Date().getTimezoneOffset() }),
})
export const createVocabularySetWithVocabularies = ({ title = '', cover_image_url = '', vocabularies = [] } = {}) => apiRequest('vocabulary-sets/with-vocabularies', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title, cover_image_url, vocabularies, timezone_offset_minutes: new Date().getTimezoneOffset() }),
})
export const updateVocabularySet = (id, updates) => apiRequest(`vocabulary-sets/${encodeURIComponent(id)}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
})
