import jwt from 'jsonwebtoken'

export function createAuthenticateToken(jwtSecret) {
  if (!jwtSecret) throw new Error('JWT_SECRET is required to configure authentication.')

  return function authenticateToken(request, response, next) {
    const authorization = request.get('authorization') || ''
    const match = authorization.match(/^Bearer\s+(.+)$/i)
    if (!match) return response.status(401).json({ error: 'Authentication is required.' })

    try {
      const payload = jwt.verify(match[1], jwtSecret)
      if (!payload?.user_id || !payload?.email) throw new Error('Invalid token payload.')
      request.user = { id: String(payload.user_id), email: payload.email }
      return next()
    } catch {
      return response.status(401).json({ error: 'The authentication token is invalid or expired.' })
    }
  }
}
