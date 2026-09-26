async function readJson(response) {
  let data

  try {
    data = await response.json()
  } catch {
    throw new Error(`The server returned an unexpected response (${response.status}).`)
  }

  if (!response.ok) {
    const error = new Error(data.error || 'CEFR analysis failed. Please try again.')
    error.status = response.status
    throw error
  }

  return data
}

export async function analyzeCefrText(text) {
  try {
    const response = await fetch('/api/analysis/cefr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    return readJson(response)
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Unable to reach the server. Check that the backend is running.')
    }

    throw error
  }
}

export async function prepareVocabularyFromContext(items) {
  try {
    const response = await fetch('/api/analysis/prepare-vocabulary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })

    return readJson(response)
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Unable to reach the server. Check that the backend is running.')
    }

    throw error
  }
}

export async function translatePreparedDefinition(meaningEn) {
  try {
    const response = await fetch('/api/analysis/translate-definition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meaning_en: meaningEn }),
    })

    return readJson(response)
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Unable to reach the server. Check that the backend is running.')
    }

    throw error
  }
}
