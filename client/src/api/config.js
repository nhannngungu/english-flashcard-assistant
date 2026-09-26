const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

export const apiBaseUrl = configuredApiBaseUrl
  ? configuredApiBaseUrl.replace(/\/+$/, '')
  : '/api'

export function apiUrl(path) {
  return `${apiBaseUrl}/${String(path).replace(/^\/+/, '')}`
}
