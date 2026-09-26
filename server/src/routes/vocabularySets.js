import { Router } from 'express'
import db from '../database.js'
import {
  defaultVocabularySetTitle,
  getVocabularySetPage,
  vocabularySetPageSize,
} from '../services/vocabularySets.js'

const router = Router()

function optionalText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function positiveInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

function sendDatabaseError(response, error) {
  console.error(error.message)
  return response.status(500).json({ error: 'A database error occurred.' })
}

router.get('/', (request, response) => {
  const page = getVocabularySetPage(request.query.page)
  const offset = (page - 1) * vocabularySetPageSize

  db.get('SELECT COUNT(*) AS total FROM vocabulary_sets', (countError, countRow) => {
    if (countError) return sendDatabaseError(response, countError)

    db.all(
      `
        SELECT vocabulary_set.*, COUNT(vocabulary.id) AS word_count
        FROM vocabulary_sets vocabulary_set
        LEFT JOIN vocabularies vocabulary ON vocabulary.set_id = vocabulary_set.id
        GROUP BY vocabulary_set.id
        ORDER BY datetime(vocabulary_set.created_at) DESC, vocabulary_set.id DESC
        LIMIT ? OFFSET ?
      `,
      [vocabularySetPageSize, offset],
      (error, rows) => {
        if (error) return sendDatabaseError(response, error)

        const total = Number(countRow.total) || 0
        return response.json({
          items: rows,
          page,
          page_size: vocabularySetPageSize,
          total,
          total_pages: Math.max(1, Math.ceil(total / vocabularySetPageSize)),
        })
      },
    )
  })
})

router.post('/', (request, response) => {
  const title = optionalText(request.body.title)
    || defaultVocabularySetTitle(new Date(), Number(request.body.timezone_offset_minutes))
  const coverImageUrl = optionalText(request.body.cover_image_url)

  if (title.length > 160) {
    return response.status(400).json({ error: 'title must be 160 characters or fewer.' })
  }

  if (coverImageUrl.length > 2000) {
    return response.status(400).json({ error: 'cover_image_url must be 2000 characters or fewer.' })
  }

  db.run(
    'INSERT INTO vocabulary_sets (title, cover_image_url) VALUES (?, ?)',
    [title, coverImageUrl],
    function insertSet(error) {
      if (error) return sendDatabaseError(response, error)

      db.get('SELECT * FROM vocabulary_sets WHERE id = ?', [this.lastID], (selectError, row) => {
        if (selectError) return sendDatabaseError(response, selectError)
        return response.status(201).json({ ...row, word_count: 0 })
      })
    },
  )
})

router.get('/:id', (request, response) => {
  const id = positiveInteger(request.params.id)
  if (!id) return response.status(400).json({ error: 'id must be a positive integer.' })

  db.get(
    `
      SELECT vocabulary_set.*, COUNT(vocabulary.id) AS word_count
      FROM vocabulary_sets vocabulary_set
      LEFT JOIN vocabularies vocabulary ON vocabulary.set_id = vocabulary_set.id
      WHERE vocabulary_set.id = ?
      GROUP BY vocabulary_set.id
    `,
    [id],
    (error, set) => {
      if (error) return sendDatabaseError(response, error)
      if (!set) return response.status(404).json({ error: 'Vocabulary set not found.' })

      db.all(
        'SELECT * FROM vocabularies WHERE set_id = ? ORDER BY id ASC',
        [id],
        (wordsError, words) => {
          if (wordsError) return sendDatabaseError(response, wordsError)
          return response.json({ ...set, words })
        },
      )
    },
  )
})

router.patch('/:id', (request, response) => {
  const id = positiveInteger(request.params.id)
  if (!id) return response.status(400).json({ error: 'id must be a positive integer.' })

  const hasTitle = Object.hasOwn(request.body, 'title')
  const hasCover = Object.hasOwn(request.body, 'cover_image_url')
  if (!hasTitle && !hasCover) {
    return response.status(400).json({ error: 'Provide title or cover_image_url to update.' })
  }

  const title = hasTitle ? optionalText(request.body.title) : null
  const coverImageUrl = hasCover ? optionalText(request.body.cover_image_url) : null
  if (hasTitle && !title) return response.status(400).json({ error: 'title cannot be empty.' })
  if (title?.length > 160) return response.status(400).json({ error: 'title must be 160 characters or fewer.' })
  if (coverImageUrl?.length > 2000) return response.status(400).json({ error: 'cover_image_url must be 2000 characters or fewer.' })

  db.run(
    `
      UPDATE vocabulary_sets
      SET title = CASE WHEN ? THEN ? ELSE title END,
          cover_image_url = CASE WHEN ? THEN ? ELSE cover_image_url END
      WHERE id = ?
    `,
    [hasTitle ? 1 : 0, title, hasCover ? 1 : 0, coverImageUrl, id],
    function updateSet(error) {
      if (error) return sendDatabaseError(response, error)
      if (this.changes === 0) return response.status(404).json({ error: 'Vocabulary set not found.' })

      db.get('SELECT * FROM vocabulary_sets WHERE id = ?', [id], (selectError, row) => {
        if (selectError) return sendDatabaseError(response, selectError)
        return response.json(row)
      })
    },
  )
})

export default router
