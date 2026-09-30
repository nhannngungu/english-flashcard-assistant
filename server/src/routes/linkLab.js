import { createAsyncRouter } from '../middleware/asyncRoute.js'

const modeRequirements = {
  classic: `BTRIM(vocabulary.word) <> '' AND BTRIM(vocabulary.meaning_vi) <> ''`,
  deep: `BTRIM(vocabulary.word) <> '' AND BTRIM(vocabulary.meaning_vi) <> '' AND BTRIM(vocabulary.example) <> ''`,
  visual: `BTRIM(vocabulary.word) <> '' AND BTRIM(vocabulary.image_url) <> ''`,
  speed: `BTRIM(vocabulary.word) <> '' AND BTRIM(vocabulary.meaning_vi) <> ''`,
}

const allowedLimits = new Set([12, 18, 24])
const allowedStatuses = new Set(['all', 'new', 'learning', 'learned', 'due'])

function normalizedOption(value) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('en-US') : ''
}

function statusCondition(status) {
  if (status === 'all') return { join: '', sql: '', values: [] }
  if (status !== 'due') return { join: '', sql: 'AND vocabulary.status = $STATUS', values: [status] }
  return {
    join: `LEFT JOIN (
      SELECT DISTINCT ON (history.user_id, history.vocabulary_id)
        history.id, history.user_id, history.vocabulary_id, history.next_review_at
      FROM review_history history
      ORDER BY history.user_id, history.vocabulary_id, history.reviewed_at DESC, history.id DESC
    ) latest_review
      ON latest_review.vocabulary_id = vocabulary.id AND latest_review.user_id = vocabulary.user_id`,
    sql: `AND ((latest_review.id IS NULL AND vocabulary.status IN ('new', 'learning')) OR latest_review.next_review_at <= $STATUS)`,
    values: [new Date().toISOString()],
  }
}

export default function createLinkLabRouter(database) {
  const router = createAsyncRouter()

  router.get('/random', async (request, response) => {
    const mode = normalizedOption(request.query.mode)
    const status = normalizedOption(request.query.status) || 'all'
    const limit = Number(request.query.limit || 18)
    if (!Object.hasOwn(modeRequirements, mode)) return response.status(400).json({ error: 'mode must be one of: classic, deep, visual, speed.' })
    if (!allowedLimits.has(limit)) return response.status(400).json({ error: 'limit must be one of: 12, 18, 24.' })
    if (!allowedStatuses.has(status)) return response.status(400).json({ error: 'status must be one of: all, new, learning, learned, due.' })

    const filter = statusCondition(status)
    const baseFrom = `FROM vocabularies vocabulary ${filter.join}`
    const baseWhere = `vocabulary.user_id = $1 AND ${modeRequirements[mode]}`
    const countWhere = `${baseWhere} ${filter.sql.replace('$STATUS', '$2')}`
    const itemsWhere = `${baseWhere} ${filter.sql.replace('$STATUS', '$3')}`
    const [countResult, itemsResult] = await Promise.all([
      database.query(`SELECT COUNT(*)::integer AS total ${baseFrom} WHERE ${countWhere}`, [request.user.id, ...filter.values]),
      database.query(`SELECT vocabulary.* ${baseFrom} WHERE ${itemsWhere} ORDER BY RANDOM() LIMIT $2`, [request.user.id, limit, ...filter.values]),
    ])
    const eligibleCount = Number(countResult.rows[0]?.total) || 0
    return response.json({
      items: itemsResult.rows,
      mode,
      status,
      requested_limit: limit,
      eligible_count: eligibleCount,
      reduced: itemsResult.rowCount < limit,
    })
  })

  return router
}
