import { withTransaction } from '../database.js'
import { createAsyncRouter } from '../middleware/asyncRoute.js'
import { calculateReviewSchedule, reviewRatings } from '../services/spacedRepetition.js'

const allowedStatuses = ['new', 'learning', 'learned']
const optionalText = (value) => typeof value === 'string' ? value.trim() : ''

function positiveInteger(value) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function parseVocabularyInput(body = {}) {
  const word = optionalText(body.word)
  const status = body.status === undefined ? 'new' : optionalText(body.status)
  const meaningEn = optionalText(body.meaning_en) || optionalText(body.meaning)
  const hasSetId = Object.hasOwn(body, 'set_id')
  const setId = body.set_id === undefined || body.set_id === null || body.set_id === '' ? null : positiveInteger(body.set_id)
  if (!word) return { error: 'word is required and cannot be empty.' }
  if (!allowedStatuses.includes(status)) return { error: 'status must be one of: new, learning, learned.' }
  if (hasSetId && body.set_id !== null && body.set_id !== '' && !setId) return { error: 'set_id must be a positive integer or null.' }

  return { value: {
    word,
    meaningEn,
    meaningVi: body.meaning_vi === undefined ? null : optionalText(body.meaning_vi),
    partOfSpeech: optionalText(body.part_of_speech),
    example: optionalText(body.example),
    imageUrl: optionalText(body.image_url),
    phonetic: optionalText(body.phonetic),
    audioUrl: optionalText(body.audio_url),
    setId,
    hasSetId,
    status,
  } }
}

async function verifyOwnedSet(database, setId, userId) {
  if (setId === null) return true
  const result = await database.query('SELECT 1 FROM vocabulary_sets WHERE id = $1 AND user_id = $2', [setId, userId])
  return result.rowCount > 0
}

const latestReviewJoin = `
  LEFT JOIN LATERAL (
    SELECT history.id, history.next_review_at, history.interval_days, history.ease_factor
    FROM review_history history
    WHERE history.vocabulary_id = vocabulary.id AND history.user_id = vocabulary.user_id
    ORDER BY history.reviewed_at DESC, history.id DESC
    LIMIT 1
  ) latest_review ON TRUE
`

export default function createVocabularyRouter(database) {
  const router = createAsyncRouter()

  router.get('/', async (request, response) => {
    const result = await database.query('SELECT * FROM vocabularies WHERE user_id = $1 ORDER BY id DESC', [request.user.id])
    return response.json(result.rows)
  })

  router.get('/review/smart', async (request, response) => {
    const result = await database.query(
      `SELECT vocabulary.*, latest_review.next_review_at, latest_review.interval_days, latest_review.ease_factor
       FROM vocabularies vocabulary ${latestReviewJoin}
       WHERE vocabulary.user_id = $1
         AND ((latest_review.id IS NULL AND vocabulary.status IN ('new', 'learning')) OR latest_review.next_review_at <= CURRENT_TIMESTAMP)
       ORDER BY CASE WHEN latest_review.id IS NULL THEN 1 ELSE 0 END, latest_review.next_review_at ASC, vocabulary.id ASC`,
      [request.user.id],
    )
    return response.json(result.rows)
  })

  router.post('/:id/review', async (request, response) => {
    const id = positiveInteger(request.params.id)
    const rating = optionalText(request.body?.rating).toLocaleLowerCase('en-US')
    if (!id) return response.status(400).json({ error: 'id must be a positive integer.' })
    if (!reviewRatings.has(rating)) return response.status(400).json({ error: 'rating must be one of: again, hard, good, easy.' })

    const result = await withTransaction(database, async (client) => {
      const selected = await client.query(
        'SELECT * FROM vocabularies WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [id, request.user.id],
      )
      const vocabulary = selected.rows[0]
      if (!vocabulary) return null

      const reviewState = await client.query(
        `SELECT interval_days, ease_factor,
                COUNT(*) OVER () AS review_count
         FROM review_history
         WHERE vocabulary_id = $1 AND user_id = $2
         ORDER BY reviewed_at DESC, id DESC LIMIT 1`,
        [id, request.user.id],
      )
      const previousReview = reviewState.rows[0]

      const schedule = calculateReviewSchedule({
        rating,
        previousIntervalDays: Number(previousReview?.interval_days) || 0,
        previousEaseFactor: Number(previousReview?.ease_factor) || 2.5,
        reviewCount: Number(previousReview?.review_count) || 0,
      })
      const nextStatus = rating === 'again' || rating === 'hard' ? 'learning' : 'learned'
      const inserted = await client.query(
        `INSERT INTO review_history (user_id, vocabulary_id, rating, next_review_at, interval_days, ease_factor)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, rating, next_review_at, interval_days, ease_factor`,
        [request.user.id, id, rating, schedule.nextReviewAt, schedule.intervalDays, schedule.easeFactor],
      )
      const updated = await client.query(
        'UPDATE vocabularies SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
        [nextStatus, id, request.user.id],
      )
      return { vocabulary: updated.rows[0], review: inserted.rows[0] }
    })

    if (!result) return response.status(404).json({ error: 'Vocabulary not found.' })
    return response.json(result)
  })

  router.get('/:id', async (request, response) => {
    const id = positiveInteger(request.params.id)
    if (!id) return response.status(400).json({ error: 'id must be a positive integer.' })
    const result = await database.query('SELECT * FROM vocabularies WHERE id = $1 AND user_id = $2', [id, request.user.id])
    if (!result.rows[0]) return response.status(404).json({ error: 'Vocabulary not found.' })
    return response.json(result.rows[0])
  })

  router.post('/', async (request, response) => {
    const input = parseVocabularyInput(request.body)
    if (input.error) return response.status(400).json({ error: input.error })
    const values = input.value
    if (!await verifyOwnedSet(database, values.setId, request.user.id)) return response.status(404).json({ error: 'Vocabulary set not found.' })
    const result = await database.query(
      `INSERT INTO vocabularies
         (user_id, word, meaning, meaning_en, meaning_vi, part_of_speech, example, image_url, phonetic, audio_url, set_id, status)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [request.user.id, values.word, values.meaningEn, values.meaningVi ?? '', values.partOfSpeech, values.example, values.imageUrl, values.phonetic, values.audioUrl, values.setId, values.status],
    )
    return response.status(201).json(result.rows[0])
  })

  router.put('/:id', async (request, response) => {
    const id = positiveInteger(request.params.id)
    if (!id) return response.status(400).json({ error: 'id must be a positive integer.' })
    const input = parseVocabularyInput(request.body)
    if (input.error) return response.status(400).json({ error: input.error })
    const values = input.value
    if (values.hasSetId && !await verifyOwnedSet(database, values.setId, request.user.id)) return response.status(404).json({ error: 'Vocabulary set not found.' })
    const result = await database.query(
      `UPDATE vocabularies SET word = $1, meaning = $2, meaning_en = $2, meaning_vi = COALESCE($3, meaning_vi),
         part_of_speech = $4, example = $5, image_url = $6, phonetic = $7, audio_url = $8,
         set_id = CASE WHEN $9::boolean THEN $10 ELSE set_id END, status = $11, updated_at = CURRENT_TIMESTAMP
       WHERE id = $12 AND user_id = $13 RETURNING *`,
      [values.word, values.meaningEn, values.meaningVi, values.partOfSpeech, values.example, values.imageUrl, values.phonetic, values.audioUrl, values.hasSetId, values.setId, values.status, id, request.user.id],
    )
    if (!result.rows[0]) return response.status(404).json({ error: 'Vocabulary not found.' })
    return response.json(result.rows[0])
  })

  router.patch('/:id/status', async (request, response) => {
    const id = positiveInteger(request.params.id)
    const status = optionalText(request.body?.status)
    if (!id) return response.status(400).json({ error: 'id must be a positive integer.' })
    if (!allowedStatuses.includes(status)) return response.status(400).json({ error: 'status must be one of: new, learning, learned.' })
    const result = await database.query(
      'UPDATE vocabularies SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
      [status, id, request.user.id],
    )
    if (!result.rows[0]) return response.status(404).json({ error: 'Vocabulary not found.' })
    return response.json(result.rows[0])
  })

  router.delete('/:id', async (request, response) => {
    const id = positiveInteger(request.params.id)
    if (!id) return response.status(400).json({ error: 'id must be a positive integer.' })
    const result = await database.query('DELETE FROM vocabularies WHERE id = $1 AND user_id = $2', [id, request.user.id])
    if (result.rowCount === 0) return response.status(404).json({ error: 'Vocabulary not found.' })
    return response.status(204).send()
  })

  return router
}
