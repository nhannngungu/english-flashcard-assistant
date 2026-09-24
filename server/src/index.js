import express from 'express'
import db from './database.js'

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

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`)
})
