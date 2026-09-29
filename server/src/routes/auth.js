import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import { createAsyncRouter } from '../middleware/asyncRoute.js'
import { AvatarStorageConfigurationError } from '../services/avatarStorage.js'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLocaleLowerCase('en-US') : ''
const cleanText = (value) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
const normalizeIdentifier = (value) => cleanText(value).toLocaleLowerCase('en-US')

const allowedAvatarTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

function detectedImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return ''
}

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(request, file, callback) {
    if (allowedAvatarTypes.has(file.mimetype)) return callback(null, true)
    const error = new Error('Unsupported avatar type.')
    error.code = 'INVALID_AVATAR_TYPE'
    return callback(error)
  },
})

function publicUser(user) {
  return {
    id: String(user.id),
    email: user.email,
    display_name: user.display_name,
    avatar_url: user.avatar_url ?? null,
    avatar_public_id: user.avatar_public_id ?? null,
    created_at: user.created_at,
    updated_at: user.updated_at,
  }
}

function createToken(user, jwtSecret) {
  return jwt.sign({ user_id: String(user.id), email: user.email }, jwtSecret, { expiresIn: '7d' })
}

export default function createAuthRouter(database, { jwtSecret, authenticateToken, avatarStorage }) {
  const router = createAsyncRouter()

  router.post('/register', async (request, response) => {
    const email = normalizeEmail(request.body?.email)
    const password = typeof request.body?.password === 'string' ? request.body.password : ''
    const displayName = cleanText(request.body?.display_name)
    if (!emailPattern.test(email) || email.length > 320) return response.status(400).json({ error: 'A valid email address is required.' })
    if (password.length < 8 || password.length > 72) return response.status(400).json({ error: 'Password must be between 8 and 72 characters.' })
    if (!displayName || displayName.length > 100) return response.status(400).json({ error: 'Display name must be between 1 and 100 characters.' })

    try {
      const existing = await database.query(
        `SELECT email, display_name FROM users
         WHERE email = $1 OR LOWER(BTRIM(display_name)) = $2`,
        [email, normalizeIdentifier(displayName)],
      )
      if (existing.rows.some((user) => user.email === email)) {
        return response.status(409).json({ error: 'An account with this email already exists.' })
      }
      if (existing.rows.some((user) => normalizeIdentifier(user.display_name) === normalizeIdentifier(displayName))) {
        return response.status(409).json({ error: 'This display name is already in use.' })
      }

      const passwordHash = await bcrypt.hash(password, 12)
      const result = await database.query(
        'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, email, display_name, avatar_url, avatar_public_id, created_at, updated_at',
        [email, passwordHash, displayName],
      )
      const user = result.rows[0]
      return response.status(201).json({ token: createToken(user, jwtSecret), user: publicUser(user) })
    } catch (error) {
      if (error.code === '23505') {
        if (error.constraint === 'users_display_name_lower_unique') return response.status(409).json({ error: 'This display name is already in use.' })
        return response.status(409).json({ error: 'An account with this email already exists.' })
      }
      throw error
    }
  })

  router.post('/login', async (request, response) => {
    const identifier = normalizeIdentifier(request.body?.identifier)
    const password = typeof request.body?.password === 'string' ? request.body.password : ''
    if (!identifier || !password) return response.status(400).json({ error: 'Identifier and password are required.' })

    const result = await database.query(
      `SELECT * FROM users
       WHERE email = $1 OR LOWER(BTRIM(display_name)) = $1
       ORDER BY CASE WHEN email = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [identifier],
    )
    const user = result.rows[0]
    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      return response.status(401).json({ error: 'Invalid credentials.' })
    }
    return response.json({ token: createToken(user, jwtSecret), user: publicUser(user) })
  })

  router.get('/me', authenticateToken, async (request, response) => {
    const result = await database.query('SELECT id, email, display_name, avatar_url, avatar_public_id, created_at, updated_at FROM users WHERE id = $1', [request.user.id])
    if (!result.rows[0]) return response.status(401).json({ error: 'The authenticated user no longer exists.' })
    return response.json({ user: publicUser(result.rows[0]) })
  })

  router.patch('/profile', authenticateToken, async (request, response) => {
    const hasDisplayName = Object.hasOwn(request.body || {}, 'display_name')
    if (!hasDisplayName) return response.status(400).json({ error: 'Provide display_name to update.' })

    const displayName = cleanText(request.body.display_name)
    if (!displayName || displayName.length > 100) {
      return response.status(400).json({ error: 'Display name must be between 1 and 100 characters.' })
    }

    try {
      const duplicate = await database.query(
        'SELECT 1 FROM users WHERE LOWER(BTRIM(display_name)) = $1 AND id <> $2 LIMIT 1',
        [normalizeIdentifier(displayName), request.user.id],
      )
      if (duplicate.rowCount > 0) return response.status(409).json({ error: 'This display name is already in use.' })

      const result = await database.query(
        `UPDATE users
         SET display_name = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, email, display_name, avatar_url, avatar_public_id, created_at, updated_at`,
        [displayName, request.user.id],
      )
      if (!result.rows[0]) return response.status(401).json({ error: 'The authenticated user no longer exists.' })
      return response.json({ user: publicUser(result.rows[0]) })
    } catch (error) {
      if (error.code === '23505') return response.status(409).json({ error: 'This display name is already in use.' })
      throw error
    }
  })

  router.post('/avatar', authenticateToken, avatarUpload.single('avatar'), async (request, response) => {
    if (!request.file) return response.status(400).json({ error: 'Choose an avatar image to upload.' })
    if (detectedImageType(request.file.buffer) !== request.file.mimetype) {
      return response.status(400).json({ error: 'The uploaded file contents do not match a supported image format.' })
    }
    if (!avatarStorage) return response.status(503).json({ error: 'Avatar uploads are not configured on this server.' })

    const currentResult = await database.query('SELECT avatar_public_id FROM users WHERE id = $1', [request.user.id])
    if (!currentResult.rows[0]) return response.status(401).json({ error: 'The authenticated user no longer exists.' })

    let uploaded
    try {
      uploaded = await avatarStorage.upload(request.file.buffer, { mimeType: request.file.mimetype })
    } catch (error) {
      console.error(`Avatar upload failed: ${error.message}`)
      const status = error instanceof AvatarStorageConfigurationError ? 503 : 502
      return response.status(status).json({ error: status === 503 ? 'Avatar uploads are not configured on this server.' : 'The avatar could not be uploaded. Please try again.' })
    }

    try {
      const updated = await database.query(
        `UPDATE users SET avatar_url = $1, avatar_public_id = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 RETURNING avatar_url, avatar_public_id`,
        [uploaded.avatarUrl, uploaded.publicId, request.user.id],
      )
      if (!updated.rows[0]) {
        await avatarStorage.destroy(uploaded.publicId).catch(() => {})
        return response.status(401).json({ error: 'The authenticated user no longer exists.' })
      }
    } catch (error) {
      await avatarStorage.destroy(uploaded.publicId).catch(() => {})
      throw error
    }

    const previousPublicId = currentResult.rows[0].avatar_public_id
    if (previousPublicId && previousPublicId !== uploaded.publicId) {
      try {
        await avatarStorage.destroy(previousPublicId)
      } catch (error) {
        console.error(`Old avatar cleanup failed: ${error.message}`)
      }
    }
    return response.json({ avatar_url: uploaded.avatarUrl, avatar_public_id: uploaded.publicId })
  })

  router.delete('/avatar', authenticateToken, async (request, response) => {
    const currentResult = await database.query('SELECT avatar_public_id FROM users WHERE id = $1', [request.user.id])
    if (!currentResult.rows[0]) return response.status(401).json({ error: 'The authenticated user no longer exists.' })
    const publicId = currentResult.rows[0].avatar_public_id

    if (publicId) {
      if (!avatarStorage) return response.status(503).json({ error: 'Avatar uploads are not configured on this server.' })
      try {
        await avatarStorage.destroy(publicId)
      } catch (error) {
        console.error(`Avatar removal failed: ${error.message}`)
        const status = error instanceof AvatarStorageConfigurationError ? 503 : 502
        return response.status(status).json({ error: status === 503 ? 'Avatar uploads are not configured on this server.' : 'The avatar could not be removed. Please try again.' })
      }
    }

    await database.query(
      'UPDATE users SET avatar_url = NULL, avatar_public_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [request.user.id],
    )
    return response.json({ avatar_url: null, avatar_public_id: null })
  })

  return router
}
