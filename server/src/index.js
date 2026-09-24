import express from 'express'
import { fileURLToPath } from 'node:url'
import db from './database.js'
import dictionaryRoutes from './routes/dictionary.js'
import imageRoutes from './routes/images.js'
import vocabularyRoutes from './routes/vocabularies.js'

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)))
} catch (error) {
  if (error.code !== 'ENOENT') {
    console.warn(`Could not load server/.env: ${error.message}`)
  }
}

const app = express()
const port = process.env.PORT || 3000

app.use(express.json())

app.get('/api/health', (request, response) => {
  db.get('SELECT 1 AS connected', (error) => {
    if (error) {
      return response.status(503).json({ status: 'error', database: 'unavailable' })
    }

    return response.json({ status: 'ok', database: 'connected' })
  })
})

app.use('/api/vocabularies', vocabularyRoutes)
app.use('/api/dictionary', dictionaryRoutes)
app.use('/api/images', imageRoutes)

app.use((error, request, response, next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return response.status(400).json({ error: 'Request body must be valid JSON.' })
  }

  console.error(error)
  return response.status(500).json({ error: 'An unexpected server error occurred.' })
})

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`)
})
