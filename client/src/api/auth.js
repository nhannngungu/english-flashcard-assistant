import { apiRequest } from './client.js'

export function registerAccount(account) {
  return apiRequest('auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(account),
  }, { authenticated: false })
}

export function loginAccount(credentials) {
  return apiRequest('auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  }, { authenticated: false })
}

export function getCurrentUser() {
  return apiRequest('auth/me')
}

export function updateUserProfile(profile) {
  return apiRequest('auth/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
}

export function uploadUserAvatar(file) {
  const body = new FormData()
  body.append('avatar', file)
  return apiRequest('auth/avatar', { method: 'POST', body })
}

export function deleteUserAvatar() {
  return apiRequest('auth/avatar', { method: 'DELETE' })
}
