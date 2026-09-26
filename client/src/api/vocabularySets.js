const vocabularySetsApiUrl = '/api/vocabulary-sets'

async function request(url, options) {
  let response

  try {
    response = await fetch(url, options)
  } catch {
    throw new Error('Unable to reach the server. Check that the backend is running.')
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

export function getVocabularySets(page = 1) {
  return request(`${vocabularySetsApiUrl}?page=${encodeURIComponent(page)}`)
}

export async function getAllVocabularySets() {
  const firstPage = await getVocabularySets(1)
  const pages = [firstPage]

  for (let page = 2; page <= firstPage.total_pages; page += 1) {
    pages.push(await getVocabularySets(page))
  }

  return pages.flatMap((result) => result.items)
}

export function getVocabularySet(id) {
  return request(`${vocabularySetsApiUrl}/${encodeURIComponent(id)}`)
}

export function createVocabularySet({ title = '', cover_image_url = '' } = {}) {
  return request(vocabularySetsApiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      cover_image_url,
      timezone_offset_minutes: new Date().getTimezoneOffset(),
    }),
  })
}

export function updateVocabularySet(id, updates) {
  return request(`${vocabularySetsApiUrl}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
}
