import { Router } from 'express'
import db from '../database.js'
import { isValidEnglishVocabulary, normalizeLookupVocabulary } from './dictionary.js'
import { analyzeCefrText, normalizeExistingVocabulary } from '../services/cefrAnalysis.js'
import { prepareContextVocabularyItem } from '../services/contextVocabulary.js'
import { translateEnglishToVietnamese } from '../services/translation.js'

const router = Router()
const maximumTextLength = 100_000
const maximumPrepareItems = 30
const allowedCefrLevels = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Unknown'])

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

async function mapWithConcurrency(items, worker, limit = 3) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker))
  return results
}

function normalizePrepareItem(item = {}) {
  const word = typeof item.word === 'string' ? item.word.trim().replace(/\s+/gu, ' ') : ''
  const normalized = normalizeLookupVocabulary(item.normalized || word).toLocaleLowerCase('en-US')
  const sentence = typeof item.sentence === 'string' ? item.sentence.trim() : ''
  const surroundingContext = typeof item.surrounding_context === 'string'
    ? item.surrounding_context.trim()
    : ''
  const cefrLevel = allowedCefrLevels.has(item.cefr_level) ? item.cefr_level : 'Unknown'

  return {
    word,
    normalized,
    cefr_level: cefrLevel,
    sentence,
    surrounding_context: surroundingContext,
  }
}

router.post('/prepare-vocabulary', async (request, response, next) => {
  if (!Array.isArray(request.body?.items) || request.body.items.length === 0) {
    return response.status(400).json({ error: 'items must be a non-empty array.' })
  }

  if (request.body.items.length > maximumPrepareItems) {
    return response.status(400).json({ error: `Prepare up to ${maximumPrepareItems} vocabulary items at a time.` })
  }

  const seen = new Set()
  const items = request.body.items
    .map(normalizePrepareItem)
    .filter((item) => {
      if (!item.normalized || seen.has(item.normalized)) return false
      seen.add(item.normalized)
      return true
    })

  if (items.length === 0) {
    return response.status(400).json({ error: 'No valid vocabulary items were provided.' })
  }

  try {
    const existingVocabulary = await loadExistingVocabulary()
    const preparedItems = await mapWithConcurrency(items, async (item) => {
      if (
        item.normalized.length > 80
        || !isValidEnglishVocabulary(item.normalized)
        || item.sentence.length > 2_000
        || item.surrounding_context.length > 4_000
      ) {
        return {
          ...item,
          status: 'failed',
          existing: existingVocabulary.has(normalizeExistingVocabulary(item.normalized)),
          error: 'The vocabulary phrase or its context is invalid or too long.',
          alternatives: [],
        }
      }

      const existing = existingVocabulary.has(normalizeExistingVocabulary(item.normalized))

      try {
        return await prepareContextVocabularyItem(item, { existing })
      } catch (error) {
        console.error(`[context-enrichment] ${item.normalized}: ${error.message}`)
        return {
          ...item,
          status: 'failed',
          existing,
          error: 'Context-aware preparation failed. Please retry this item.',
          alternatives: [],
        }
      }
    }, 3)

    return response.json({ items: preparedItems })
  } catch (error) {
    return next(error)
  }
})

router.post('/translate-definition', async (request, response) => {
  const meaningEn = typeof request.body?.meaning_en === 'string' ? request.body.meaning_en.trim() : ''

  if (!meaningEn || meaningEn.length > 1_000) {
    return response.status(400).json({ error: 'meaning_en is required and must be 1,000 characters or fewer.' })
  }

  const translation = await translateEnglishToVietnamese(meaningEn)
  return response.json({
    meaning_vi: translation.meaningVi,
    translation_source: translation.source,
  })
})

export default router
