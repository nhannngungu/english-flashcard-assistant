import { apiUrl } from './config.js'

const tokenStorageKey = 'english-flashcard-auth-token'

export function getAuthToken() {
  return localStorage.getItem(tokenStorageKey) || ''
}

export function storeAuthToken(token) {
  if (token) localStorage.setItem(tokenStorageKey, token)
  else localStorage.removeItem(tokenStorageKey)
}

export async function apiRequest(path, options = {}, { authenticated = true } = {}) {
  const headers = new Headers(options.headers || {})
  const token = getAuthToken()
  if (authenticated && token) headers.set('Authorization', `Bearer ${token}`)

  let response
  try {
    response = await fetch(apiUrl(path), { ...options, headers })
  } catch {
    throw new Error('Unable to reach the server. Check that the backend is running.')
  }

  let data = null
  if (response.status !== 204) {
    try {
      data = await response.json()
    } catch {
      throw new Error(`The server returned an unexpected response (${response.status}).`)
    }
  }

  if (!response.ok) {
    if (authenticated && response.status === 401) window.dispatchEvent(new Event('auth:unauthorized'))
    const error = new Error(data?.error || 'Something went wrong. Please try again.')
    error.status = response.status
    throw error
  }

  return data
}
