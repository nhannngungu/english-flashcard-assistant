import { Router } from 'express'
import db from '../database.js'

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

  if (!word) {
    return { error: 'word is required and cannot be empty.' }
  }

  if (!allowedStatuses.includes(status)) {
    return { error: 'status must be one of: new, learning, learned.' }
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
      (word, meaning, meaning_en, meaning_vi, part_of_speech, example, image_url, phonetic, audio_url, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        phonetic = ?, audio_url = ?, status = ?, updated_at = CURRENT_TIMESTAMP
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
