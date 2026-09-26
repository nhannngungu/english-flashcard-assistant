import { Router } from 'express'
import db from '../database.js'
import { parseDashboardTimeWindow, percentage } from '../services/dashboardStatistics.js'

const router = Router()

function dbGet(query, parameters = []) {
  return new Promise((resolve, reject) => {
    db.get(query, parameters, (error, row) => error ? reject(error) : resolve(row))
  })
}

function dbAll(query, parameters = []) {
  return new Promise((resolve, reject) => {
    db.all(query, parameters, (error, rows) => error ? reject(error) : resolve(rows))
  })
}

function count(value) {
  return Number(value) || 0
}

router.get('/dashboard', async (request, response) => {
  const window = parseDashboardTimeWindow(request.query)
  if (!window) {
    return response.status(400).json({
      error: 'Valid local-day UTC boundaries and timezone_offset_minutes are required.',
    })
  }

  const localTimeModifier = `${-window.timezoneOffset >= 0 ? '+' : ''}${-window.timezoneOffset} minutes`
  const dayRows = window.activityStarts.slice(0, 7).map((start, index) => ({
    index,
    start,
    end: window.activityStarts[index + 1],
  }))
  const dayValues = dayRows.map(() => '(?, ?, ?)').join(', ')
  const dayParameters = dayRows.flatMap((day) => [day.index, day.start, day.end])
  const latestReviews = `
    SELECT review.*
    FROM review_history review
    WHERE review.id = (
      SELECT candidate.id
      FROM review_history candidate
      WHERE candidate.vocabulary_id = review.vocabulary_id
      ORDER BY datetime(candidate.reviewed_at) DESC, candidate.id DESC
      LIMIT 1
    )
  `

  try {
    const [summaryRow, ratingRow, activityRows, upcomingRow, setCountRow, recentSets, recentActivity] = await Promise.all([
      dbGet(
        `
          SELECT
            COUNT(*) AS total_vocabulary,
            COALESCE(SUM(CASE WHEN vocabulary.status = 'new'
              OR NOT EXISTS (SELECT 1 FROM review_history history WHERE history.vocabulary_id = vocabulary.id)
              THEN 1 ELSE 0 END), 0) AS new_count,
            COALESCE(SUM(CASE WHEN vocabulary.status = 'learning' THEN 1 ELSE 0 END), 0) AS learning_count,
            COALESCE(SUM(CASE WHEN vocabulary.status = 'learned' THEN 1 ELSE 0 END), 0) AS learned_count,
            COALESCE(SUM(CASE WHEN datetime((
              SELECT history.next_review_at
              FROM review_history history
              WHERE history.vocabulary_id = vocabulary.id
              ORDER BY datetime(history.reviewed_at) DESC, history.id DESC
              LIMIT 1
            )) <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END), 0) AS due_now,
            (SELECT COUNT(*) FROM review_history
              WHERE datetime(reviewed_at) >= datetime(?) AND datetime(reviewed_at) < datetime(?)) AS reviewed_today
          FROM vocabularies vocabulary
        `,
        [window.todayStart, window.tomorrowStart],
      ),
      dbGet(
        `
          SELECT
            COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN rating = 'again' THEN 1 ELSE 0 END), 0) AS again_count,
            COALESCE(SUM(CASE WHEN rating = 'hard' THEN 1 ELSE 0 END), 0) AS hard_count,
            COALESCE(SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END), 0) AS good_count,
            COALESCE(SUM(CASE WHEN rating = 'easy' THEN 1 ELSE 0 END), 0) AS easy_count,
            COUNT(DISTINCT date(reviewed_at, ?)) AS active_days
          FROM review_history
        `,
        [localTimeModifier],
      ),
      dbAll(
        `
          WITH days(day_index, start_utc, end_utc) AS (VALUES ${dayValues})
          SELECT
            days.day_index,
            days.start_utc,
            (SELECT COUNT(*) FROM review_history history
              WHERE datetime(history.reviewed_at) >= datetime(days.start_utc)
                AND datetime(history.reviewed_at) < datetime(days.end_utc)) AS reviews,
            (SELECT COUNT(*) FROM vocabularies vocabulary
              WHERE datetime(vocabulary.created_at) >= datetime(days.start_utc)
                AND datetime(vocabulary.created_at) < datetime(days.end_utc)) AS added
          FROM days
          ORDER BY days.day_index
        `,
        dayParameters,
      ),
      dbGet(
        `
          WITH latest_review AS (${latestReviews})
          SELECT
            COALESCE(SUM(CASE WHEN datetime(next_review_at) < datetime(?) THEN 1 ELSE 0 END), 0) AS due_through_today,
            COALESCE(SUM(CASE WHEN datetime(next_review_at) >= datetime(?) AND datetime(next_review_at) < datetime(?) THEN 1 ELSE 0 END), 0) AS tomorrow,
            COALESCE(SUM(CASE WHEN datetime(next_review_at) >= datetime(?) AND datetime(next_review_at) < datetime(?) THEN 1 ELSE 0 END), 0) AS next_seven_days
          FROM latest_review
        `,
        [
          window.tomorrowStart,
          window.tomorrowStart,
          window.dayAfterTomorrowStart,
          window.dayAfterTomorrowStart,
          window.nextSevenDaysEnd,
        ],
      ),
      dbGet('SELECT COUNT(*) AS total FROM vocabulary_sets'),
      dbAll(
        `
          SELECT vocabulary_set.*, COUNT(vocabulary.id) AS word_count
          FROM vocabulary_sets vocabulary_set
          LEFT JOIN vocabularies vocabulary ON vocabulary.set_id = vocabulary_set.id
          GROUP BY vocabulary_set.id
          ORDER BY datetime(vocabulary_set.created_at) DESC, vocabulary_set.id DESC
          LIMIT 3
        `,
      ),
      dbAll(
        `
          SELECT history.id, history.rating, history.reviewed_at,
                 vocabulary.id AS vocabulary_id, vocabulary.word
          FROM review_history history
          JOIN vocabularies vocabulary ON vocabulary.id = history.vocabulary_id
          ORDER BY datetime(history.reviewed_at) DESC, history.id DESC
          LIMIT 5
        `,
      ),
    ])

    const totalReviews = count(ratingRow.total)
    const activeDays = count(ratingRow.active_days)
    const ratingCounts = {
      again: count(ratingRow.again_count),
      hard: count(ratingRow.hard_count),
      good: count(ratingRow.good_count),
      easy: count(ratingRow.easy_count),
    }

    return response.json({
      summary: {
        totalVocabulary: count(summaryRow.total_vocabulary),
        new: count(summaryRow.new_count),
        learning: count(summaryRow.learning_count),
        learned: count(summaryRow.learned_count),
        dueToday: count(summaryRow.due_now),
        reviewedToday: count(summaryRow.reviewed_today),
      },
      ratings: {
        total: totalReviews,
        ...ratingCounts,
        percentages: Object.fromEntries(
          Object.entries(ratingCounts).map(([rating, value]) => [rating, percentage(value, totalReviews)]),
        ),
      },
      performance: {
        activeDays,
        averageReviewsPerActiveDay: activeDays > 0
          ? Number((totalReviews / activeDays).toFixed(1))
          : 0,
      },
      last7Days: activityRows.map((row) => ({
        startUtc: row.start_utc,
        reviews: count(row.reviews),
        added: count(row.added),
      })),
      upcoming: {
        dueThroughToday: count(upcomingRow.due_through_today),
        tomorrow: count(upcomingRow.tomorrow),
        nextSevenDays: count(upcomingRow.next_seven_days),
      },
      reviewSets: {
        total: count(setCountRow.total),
        recent: recentSets,
      },
      recentActivity,
    })
  } catch (error) {
    console.error(error.message)
    return response.status(500).json({ error: 'Could not calculate dashboard statistics.' })
  }
})

export default router
