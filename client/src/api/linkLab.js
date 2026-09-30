import { apiRequest } from './client.js'

export function getRandomLinkLabSession({ limit = 18, mode, status = 'all' }) {
  const query = new URLSearchParams({ limit: String(limit), mode, status })
  return apiRequest(`linklab/random?${query}`)
}
