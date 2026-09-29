import { createAsyncRouter } from '../middleware/asyncRoute.js'
import { withTransaction } from '../database.js'
import { defaultVocabularySetTitle, getVocabularySetPage, vocabularySetPageSize } from '../services/vocabularySets.js'
import { parseVocabularyInput } from './vocabularies.js'

const optionalText = (value) => typeof value === 'string' ? value.trim() : ''

function positiveInteger(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

export default function createVocabularySetRouter(database) {
  const router = createAsyncRouter()

  router.get('/', async (request, response) => {
    const page = getVocabularySetPage(request.query.page)
    const offset = (page - 1) * vocabularySetPageSize
    const [countResult, setsResult] = await Promise.all([
      database.query('SELECT COUNT(*) AS total FROM vocabulary_sets WHERE user_id = $1', [request.user.id]),
      database.query(
        `SELECT vocabulary_set.*, COUNT(vocabulary.id)::integer AS word_count
         FROM vocabulary_sets vocabulary_set
         LEFT JOIN vocabularies vocabulary ON vocabulary.set_id = vocabulary_set.id AND vocabulary.user_id = vocabulary_set.user_id
         WHERE vocabulary_set.user_id = $1
         GROUP BY vocabulary_set.id
         ORDER BY vocabulary_set.created_at DESC, vocabulary_set.id DESC
         LIMIT $2 OFFSET $3`,
        [request.user.id, vocabularySetPageSize, offset],
      ),
    ])
    const total = Number(countResult.rows[0].total) || 0
    return response.json({
      items: setsResult.rows,
      page,
      page_size: vocabularySetPageSize,
      total,
      total_pages: Math.max(1, Math.ceil(total / vocabularySetPageSize)),
    })
  })

  router.post('/', async (request, response) => {
    const title = optionalText(request.body?.title) || defaultVocabularySetTitle(new Date(), Number(request.body?.timezone_offset_minutes))
    const coverImageUrl = optionalText(request.body?.cover_image_url)
    if (title.length > 160) return response.status(400).json({ error: 'title must be 160 characters or fewer.' })
    if (coverImageUrl.length > 2000) return response.status(400).json({ error: 'cover_image_url must be 2000 characters or fewer.' })

    const result = await database.query(
      'INSERT INTO vocabulary_sets (user_id, title, cover_image_url) VALUES ($1, $2, $3) RETURNING *',
      [request.user.id, title, coverImageUrl],
    )
    return response.status(201).json({ ...result.rows[0], word_count: 0 })
  })

  router.post('/with-vocabularies', async (request, response) => {
    const title = optionalText(request.body?.title) || defaultVocabularySetTitle(new Date(), Number(request.body?.timezone_offset_minutes))
    const coverImageUrl = optionalText(request.body?.cover_image_url)
    const rawVocabularies = request.body?.vocabularies
    if (title.length > 160) return response.status(400).json({ error: 'title must be 160 characters or fewer.' })
    if (coverImageUrl.length > 2000) return response.status(400).json({ error: 'cover_image_url must be 2000 characters or fewer.' })
    if (!Array.isArray(rawVocabularies) || rawVocabularies.length === 0 || rawVocabularies.length > 500) {
      return response.status(400).json({ error: 'vocabularies must contain between 1 and 500 items.' })
    }

    const parsed = rawVocabularies.map(parseVocabularyInput)
    const invalidIndex = parsed.findIndex((item) => item.error)
    if (invalidIndex >= 0) return response.status(400).json({ error: `Vocabulary ${invalidIndex + 1}: ${parsed[invalidIndex].error}` })

    const result = await withTransaction(database, async (client) => {
      const setResult = await client.query(
        'INSERT INTO vocabulary_sets (user_id, title, cover_image_url) VALUES ($1, $2, $3) RETURNING *',
        [request.user.id, title, coverImageUrl],
      )
      const set = setResult.rows[0]
      const vocabularies = []
      for (const { value } of parsed) {
        const inserted = await client.query(
          `INSERT INTO vocabularies
             (user_id, word, meaning, meaning_en, meaning_vi, part_of_speech, example, image_url, phonetic, audio_url, set_id, status)
           VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
          [request.user.id, value.word, value.meaningEn, value.meaningVi ?? '', value.partOfSpeech, value.example, value.imageUrl, value.phonetic, value.audioUrl, set.id, value.status],
        )
        vocabularies.push(inserted.rows[0])
      }
      return { set: { ...set, word_count: vocabularies.length }, vocabularies }
    })

    return response.status(201).json(result)
  })

  router.get('/:id', async (request, response) => {
    const id = positiveInteger(request.params.id)
    if (!id) return response.status(400).json({ error: 'id must be a positive integer.' })
    const setResult = await database.query(
      'SELECT * FROM vocabulary_sets WHERE id = $1 AND user_id = $2',
      [id, request.user.id],
    )
    if (!setResult.rows[0]) return response.status(404).json({ error: 'Vocabulary set not found.' })
    const wordsResult = await database.query(
      'SELECT * FROM vocabularies WHERE set_id = $1 AND user_id = $2 ORDER BY id ASC',
      [id, request.user.id],
    )
    return response.json({ ...setResult.rows[0], word_count: wordsResult.rowCount, words: wordsResult.rows })
  })

  router.patch('/:id', async (request, response) => {
    const id = positiveInteger(request.params.id)
    if (!id) return response.status(400).json({ error: 'id must be a positive integer.' })
    const hasTitle = Object.hasOwn(request.body || {}, 'title')
    const hasCover = Object.hasOwn(request.body || {}, 'cover_image_url')
    if (!hasTitle && !hasCover) return response.status(400).json({ error: 'Provide title or cover_image_url to update.' })

    const title = hasTitle ? optionalText(request.body.title) : null
    const coverImageUrl = hasCover ? optionalText(request.body.cover_image_url) : null
    if (hasTitle && !title) return response.status(400).json({ error: 'title cannot be empty.' })
    if (title?.length > 160) return response.status(400).json({ error: 'title must be 160 characters or fewer.' })
    if (coverImageUrl?.length > 2000) return response.status(400).json({ error: 'cover_image_url must be 2000 characters or fewer.' })

    const result = await database.query(
      `UPDATE vocabulary_sets
       SET title = CASE WHEN $1::boolean THEN $2 ELSE title END,
           cover_image_url = CASE WHEN $3::boolean THEN $4 ELSE cover_image_url END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND user_id = $6 RETURNING *`,
      [hasTitle, title, hasCover, coverImageUrl, id, request.user.id],
    )
    if (!result.rows[0]) return response.status(404).json({ error: 'Vocabulary set not found.' })
    return response.json(result.rows[0])
  })

  return router
}
