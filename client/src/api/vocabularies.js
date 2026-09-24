const vocabularyApiUrl = '/api/vocabularies'

async function readJson(response) {
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
