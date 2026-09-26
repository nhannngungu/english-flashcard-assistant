import { Router } from 'express'
import db from '../database.js'
import {
  calculateReviewSchedule,
  reviewRatings,
  toSqliteUtc,
} from '../services/spacedRepetition.js'

const router = Router()
const allowedStatuses = ['new', 'learning', 'learned']

function getVocabularyId(value) {
  const id = Number(value)

  if (!Number.isInteger(id) || id <= 0) {
    return null
  }

  return id
}

function optionalText(value) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

function getVocabularyInput(body = {}) {
  const word = optionalText(body.word)
  const status = body.status === undefined ? 'new' : optionalText(body.status)
  const meaningEn = optionalText(body.meaning_en) || optionalText(body.meaning)
  const hasSetId = Object.hasOwn(body, 'set_id')
  const setId = body.set_id === undefined || body.set_id === null || body.set_id === ''
    ? null
    : getVocabularyId(body.set_id)

  if (!word) {
    return { error: 'word is required and cannot be empty.' }
  }

  if (!allowedStatuses.includes(status)) {
    return { error: 'status must be one of: new, learning, learned.' }
  }

  if (body.set_id !== undefined && body.set_id !== null && body.set_id !== '' && !setId) {
    return { error: 'set_id must be a positive integer or null.' }
  }

  return {
    value: {
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
    },
  }
}

function sendDatabaseError(response, error) {
  console.error(error.message)
  return response.status(500).json({ error: 'A database error occurred.' })
}

router.get('/', (request, response) => {
  db.all('SELECT * FROM vocabularies ORDER BY id DESC', (error, rows) => {
    if (error) {
      return sendDatabaseError(response, error)
    }

    return response.json(rows)
  })
})

const latestReviewJoin = `
  LEFT JOIN review_history latest_review
    ON latest_review.id = (
      SELECT history.id
      FROM review_history history
      WHERE history.vocabulary_id = vocabulary.id
      ORDER BY datetime(history.reviewed_at) DESC, history.id DESC
      LIMIT 1
    )
`

router.get('/review/smart', (request, response) => {
  const query = `
    SELECT vocabulary.*,
           latest_review.next_review_at,
           latest_review.interval_days,
           latest_review.ease_factor
    FROM vocabularies vocabulary
    ${latestReviewJoin}
    WHERE
      (latest_review.id IS NULL AND vocabulary.status IN ('new', 'learning'))
      OR datetime(latest_review.next_review_at) <= CURRENT_TIMESTAMP
    ORDER BY
      CASE WHEN latest_review.id IS NULL THEN 1 ELSE 0 END,
      datetime(latest_review.next_review_at) ASC,
      vocabulary.id ASC
  `

  db.all(query, (error, rows) => {
    if (error) return sendDatabaseError(response, error)
    return response.json(rows)
  })
})

router.post('/:id/review', (request, response) => {
  const id = getVocabularyId(request.params.id)
  const rating = optionalText(request.body.rating).toLocaleLowerCase('en-US')

  if (!id) return response.status(400).json({ error: 'id must be a positive integer.' })
  if (!reviewRatings.has(rating)) {
    return response.status(400).json({ error: 'rating must be one of: again, hard, good, easy.' })
  }

  const query = `
    SELECT vocabulary.*,
           latest_review.interval_days AS previous_interval_days,
           latest_review.ease_factor AS previous_ease_factor,
           (SELECT COUNT(*) FROM review_history WHERE vocabulary_id = vocabulary.id) AS review_count
    FROM vocabularies vocabulary
    ${latestReviewJoin}
    WHERE vocabulary.id = ?
  `

  db.get(query, [id], (selectError, vocabulary) => {
    if (selectError) return sendDatabaseError(response, selectError)
    if (!vocabulary) return response.status(404).json({ error: 'Vocabulary not found.' })

    const schedule = calculateReviewSchedule({
      rating,
      previousIntervalDays: Number(vocabulary.previous_interval_days) || 0,
      previousEaseFactor: Number(vocabulary.previous_ease_factor) || 2.5,
      reviewCount: Number(vocabulary.review_count) || 0,
    })
    const nextReviewAt = toSqliteUtc(schedule.nextReviewAt)
    const nextStatus = rating === 'again' || rating === 'hard' ? 'learning' : 'learned'

    db.run('BEGIN TRANSACTION', (beginError) => {
      if (beginError) return sendDatabaseError(response, beginError)

      db.run(
        `
          INSERT INTO review_history
            (vocabulary_id, rating, next_review_at, interval_days, ease_factor)
          VALUES (?, ?, ?, ?, ?)
        `,
        [id, rating, nextReviewAt, schedule.intervalDays, schedule.easeFactor],
        function insertReview(insertError) {
          if (insertError) {
            return db.run('ROLLBACK', () => sendDatabaseError(response, insertError))
          }

          const reviewHistoryId = this.lastID
          db.run(
            'UPDATE vocabularies SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [nextStatus, id],
            (updateError) => {
              if (updateError) {
                return db.run('ROLLBACK', () => sendDatabaseError(response, updateError))
              }

              db.run('COMMIT', (commitError) => {
                if (commitError) return sendDatabaseError(response, commitError)

                db.get('SELECT * FROM vocabularies WHERE id = ?', [id], (finalError, updatedVocabulary) => {
                  if (finalError) return sendDatabaseError(response, finalError)
                  return response.json({
                    vocabulary: updatedVocabulary,
                    review: {
                      id: reviewHistoryId,
                      rating,
                      next_review_at: nextReviewAt,
                      interval_days: schedule.intervalDays,
                      ease_factor: schedule.easeFactor,
                    },
                  })
                })
              })
            },
          )
        },
      )
    })
  })
})

router.get('/:id', (request, response) => {
  const id = getVocabularyId(request.params.id)

  if (!id) {
    return response.status(400).json({ error: 'id must be a positive integer.' })
  }

  db.get('SELECT * FROM vocabularies WHERE id = ?', [id], (error, row) => {
    if (error) {
      return sendDatabaseError(response, error)
    }

    if (!row) {
      return response.status(404).json({ error: 'Vocabulary not found.' })
    }

    return response.json(row)
  })
})

router.post('/', (request, response) => {
  const input = getVocabularyInput(request.body)

  if (input.error) {
    return response.status(400).json({ error: input.error })
  }

  const values = input.value
  const query = `
    INSERT INTO vocabularies
      (word, meaning, meaning_en, meaning_vi, part_of_speech, example, image_url, phonetic, audio_url, set_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `

  db.run(
    query,
    [
      values.word,
      values.meaningEn,
      values.meaningEn,
      values.meaningVi ?? '',
      values.partOfSpeech,
      values.example,
      values.imageUrl,
      values.phonetic,
      values.audioUrl,
      values.setId,
      values.status,
    ],
    function insertVocabulary(error) {
      if (error) {
        return sendDatabaseError(response, error)
      }

      db.get('SELECT * FROM vocabularies WHERE id = ?', [this.lastID], (selectError, row) => {
        if (selectError) {
          return sendDatabaseError(response, selectError)
        }

        return response.status(201).json(row)
      })
    },
  )
})

router.put('/:id', (request, response) => {
  const id = getVocabularyId(request.params.id)

  if (!id) {
    return response.status(400).json({ error: 'id must be a positive integer.' })
  }

  const input = getVocabularyInput(request.body)

  if (input.error) {
    return response.status(400).json({ error: input.error })
  }

  const values = input.value
  const query = `
    UPDATE vocabularies
    SET word = ?, meaning = ?, meaning_en = ?, meaning_vi = COALESCE(?, meaning_vi),
        part_of_speech = ?, example = ?, image_url = ?,
        phonetic = ?, audio_url = ?,
        set_id = CASE WHEN ? THEN ? ELSE set_id END,
        status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `

  db.run(
    query,
    [
      values.word,
      values.meaningEn,
      values.meaningEn,
      values.meaningVi,
      values.partOfSpeech,
      values.example,
      values.imageUrl,
      values.phonetic,
      values.audioUrl,
      values.hasSetId ? 1 : 0,
      values.setId,
      values.status,
      id,
    ],
    function updateVocabulary(error) {
      if (error) {
        return sendDatabaseError(response, error)
      }

      if (this.changes === 0) {
        return response.status(404).json({ error: 'Vocabulary not found.' })
      }

      db.get('SELECT * FROM vocabularies WHERE id = ?', [id], (selectError, row) => {
        if (selectError) {
          return sendDatabaseError(response, selectError)
        }

        return response.json(row)
      })
    },
  )
})

router.patch('/:id/status', (request, response) => {
  const id = getVocabularyId(request.params.id)
  const status = optionalText(request.body.status)

  if (!id) {
    return response.status(400).json({ error: 'id must be a positive integer.' })
  }

  if (!allowedStatuses.includes(status)) {
    return response.status(400).json({ error: 'status must be one of: new, learning, learned.' })
  }

  db.run(
    'UPDATE vocabularies SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [status, id],
    function updateStatus(error) {
      if (error) {
        return sendDatabaseError(response, error)
      }

      if (this.changes === 0) {
        return response.status(404).json({ error: 'Vocabulary not found.' })
      }

      db.get('SELECT * FROM vocabularies WHERE id = ?', [id], (selectError, row) => {
        if (selectError) {
          return sendDatabaseError(response, selectError)
        }

        return response.json(row)
      })
    },
  )
})

router.delete('/:id', (request, response) => {
  const id = getVocabularyId(request.params.id)

  if (!id) {
    return response.status(400).json({ error: 'id must be a positive integer.' })
  }

  db.run('DELETE FROM vocabularies WHERE id = ?', [id], function deleteVocabulary(error) {
    if (error) {
      return sendDatabaseError(response, error)
    }

    if (this.changes === 0) {
      return response.status(404).json({ error: 'Vocabulary not found.' })
    }

    return response.status(204).send()
  })
})

export default router
