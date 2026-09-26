import { Router } from 'express'
import db from '../database.js'
import { analyzeCefrText, normalizeExistingVocabulary } from '../services/cefrAnalysis.js'

const router = Router()
const maximumTextLength = 100_000

function loadExistingVocabulary() {
  return new Promise((resolve, reject) => {
    db.all('SELECT word FROM vocabularies', (error, rows) => {
      if (error) {
        reject(error)
        return
      }

      resolve(new Set(rows.map((row) => normalizeExistingVocabulary(row.word)).filter(Boolean)))
    })
  })
}

router.post('/cefr', async (request, response, next) => {
  const text = request.body?.text

  if (typeof text !== 'string' || !text.trim()) {
    return response.status(400).json({ error: 'text is required and cannot be empty.' })
  }

  if (text.length > maximumTextLength) {
    return response.status(413).json({ error: 'Text is too long. Use up to 100,000 characters.' })
  }

  try {
    const existingVocabulary = await loadExistingVocabulary()
    return response.json(analyzeCefrText(text, existingVocabulary))
  } catch (error) {
    return next(error)
  }
})

export default router
