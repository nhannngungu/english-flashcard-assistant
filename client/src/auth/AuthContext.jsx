import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  deleteUserAvatar,
  getCurrentUser,
  loginAccount,
  registerAccount,
  updateUserProfile,
  uploadUserAvatar,
} from '../api/auth.js'
import { getAuthToken, storeAuthToken } from '../api/client.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(() => Boolean(getAuthToken()))

  function logout() {
    storeAuthToken('')
    setUser(null)
    setLoading(false)
  }

  useEffect(() => {
    const handleUnauthorized = () => logout()
    window.addEventListener('auth:unauthorized', handleUnauthorized)

    const token = getAuthToken()
    if (token) {
      getCurrentUser()
        .then((result) => setUser(result.user))
        .catch(() => logout())
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }

    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized)
  }, [])

  async function completeAuthentication(request) {
    const result = await request
    storeAuthToken(result.token)
    setUser(result.user)
    return result.user
  }

  async function updateProfile(profile) {
    const result = await updateUserProfile(profile)
    setUser(result.user)
    return result.user
  }

  async function uploadAvatar(file) {
    const avatar = await uploadUserAvatar(file)
    setUser((current) => ({ ...current, ...avatar }))
    return avatar
  }

  async function removeAvatar() {
    const avatar = await deleteUserAvatar()
    setUser((current) => ({ ...current, ...avatar }))
    return avatar
  }

  const value = useMemo(() => ({
    user,
    loading,
    login: (credentials) => completeAuthentication(loginAccount(credentials)),
    register: (account) => completeAuthentication(registerAccount(account)),
    updateProfile,
    uploadAvatar,
    removeAvatar,
    logout,
  }), [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider.')
  return context
}
