import express from 'express'
import multer from 'multer'
import { asyncRoute } from './middleware/asyncRoute.js'
import { createAuthenticateToken } from './middleware/authenticateToken.js'
import createAnalysisRouter from './routes/analysis.js'
import createAuthRouter from './routes/auth.js'
import dictionaryRoutes from './routes/dictionary.js'
import imageRoutes from './routes/images.js'
import importRoutes from './routes/imports.js'
import createStatisticsRouter from './routes/statistics.js'
import createVocabularyRouter from './routes/vocabularies.js'
import createVocabularySetRouter from './routes/vocabularySets.js'

const configuredOrigins = (value = '') => new Set(value.split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean))

export function createApp({ database, jwtSecret, clientOrigins = '', avatarStorage }) {
  if (!database) throw new Error('A PostgreSQL database pool is required.')
  const app = express()
  const allowedClientOrigins = configuredOrigins(clientOrigins)
  const authenticateToken = createAuthenticateToken(jwtSecret)

  function isAllowedClientOrigin(origin) {
    if (allowedClientOrigins.has(origin)) return true
    try {
      const url = new URL(origin)
      return (url.protocol === 'http:' || url.protocol === 'https:') && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    } catch {
      return false
    }
  }

  app.use(express.json())
  app.use((request, response, next) => {
    const origin = request.get('origin')
    if (origin && !isAllowedClientOrigin(origin)) return response.status(403).json({ error: 'This origin is not allowed to access the API.' })
    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin)
      response.setHeader('Vary', 'Origin')
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    }
    if (request.method === 'OPTIONS') return response.sendStatus(204)
    return next()
  })

  app.get('/api/health', asyncRoute(async (request, response) => {
    try {
      await database.query('SELECT 1 AS connected')
      return response.json({ status: 'ok', database: 'connected' })
    } catch {
      return response.status(503).json({ status: 'error', database: 'unavailable' })
    }
  }))

  app.use('/api/auth', createAuthRouter(database, { jwtSecret, authenticateToken, avatarStorage }))
  app.use('/api/vocabularies', authenticateToken, createVocabularyRouter(database))
  app.use('/api/vocabulary-sets', authenticateToken, createVocabularySetRouter(database))
  app.use('/api/statistics', authenticateToken, createStatisticsRouter(database))
  app.use('/api/analysis', authenticateToken, createAnalysisRouter(database))
  app.use('/api/dictionary', dictionaryRoutes)
  app.use('/api/images', imageRoutes)
  app.use('/api/import', importRoutes)

  app.use((error, request, response, next) => {
    if (error instanceof SyntaxError && 'body' in error) return response.status(400).json({ error: 'Request body must be valid JSON.' })
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return response.status(413).json({ error: 'Avatar images must be 5 MB or smaller.' })
    if (error.code === 'INVALID_AVATAR_TYPE') return response.status(400).json({ error: 'Avatar must be a JPEG, PNG, or WebP image.' })
    if (error.code === '23503') return response.status(409).json({ error: 'A related resource no longer exists or is not available.' })
    if (error.code === '23505') return response.status(409).json({ error: 'The requested value already exists.' })
    console.error(error.message)
    return response.status(500).json({ error: 'An unexpected server error occurred.' })
  })

  return app
}
