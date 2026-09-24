const vocabularyApiUrl = '/api/vocabularies'

async function readJson(response) {
  if (response.status === 204) {
    return null
  }

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong. Please try again.')
  }

  return data
}

export async function getVocabularies() {
  const response = await fetch(vocabularyApiUrl)
  return readJson(response)
}

export async function createVocabulary(vocabulary) {
  const response = await fetch(vocabularyApiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vocabulary),
  })

  return readJson(response)
}

export async function updateVocabulary(id, vocabulary) {
  const response = await fetch(`${vocabularyApiUrl}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vocabulary),
  })

  return readJson(response)
}

export async function deleteVocabulary(id) {
  const response = await fetch(`${vocabularyApiUrl}/${id}`, {
    method: 'DELETE',
  })

  return readJson(response)
}

export async function updateVocabularyStatus(id, status) {
  const response = await fetch(`${vocabularyApiUrl}/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })

  return readJson(response)
}
