import { createAsyncRouter } from '../middleware/asyncRoute.js'
import { parseDashboardTimeWindow, percentage } from '../services/dashboardStatistics.js'

const inRange = (value, start, end) => {
  const time = new Date(value).getTime()
  return time >= new Date(start).getTime() && time < new Date(end).getTime()
}

export default function createStatisticsRouter(database) {
  const router = createAsyncRouter()

  router.get('/dashboard', async (request, response) => {
    const window = parseDashboardTimeWindow(request.query)
    if (!window) return response.status(400).json({ error: 'Valid local-day UTC boundaries and timezone_offset_minutes are required.' })

    const userId = request.user.id
    const [vocabularyResult, historyResult, setResult] = await Promise.all([
      database.query('SELECT id, word, status, set_id, created_at FROM vocabularies WHERE user_id = $1', [userId]),
      database.query(
        `SELECT id, vocabulary_id, rating, reviewed_at, next_review_at, interval_days, ease_factor
         FROM review_history WHERE user_id = $1 ORDER BY reviewed_at DESC, id DESC`,
        [userId],
      ),
      database.query('SELECT * FROM vocabulary_sets WHERE user_id = $1 ORDER BY created_at DESC, id DESC', [userId]),
    ])

    const vocabularies = vocabularyResult.rows
    const history = historyResult.rows
    const sets = setResult.rows
    const vocabularyById = new Map(vocabularies.map((word) => [String(word.id), word]))
    const latestReviewByVocabulary = new Map()
    for (const review of history) {
      const key = String(review.vocabulary_id)
      if (!latestReviewByVocabulary.has(key)) latestReviewByVocabulary.set(key, review)
    }

    const now = Date.now()
    const ratingCounts = { again: 0, hard: 0, good: 0, easy: 0 }
    const activeDates = new Set()
    for (const review of history) {
      if (Object.hasOwn(ratingCounts, review.rating)) ratingCounts[review.rating] += 1
      const localTime = new Date(review.reviewed_at).getTime() - window.timezoneOffset * 60_000
      activeDates.add(new Date(localTime).toISOString().slice(0, 10))
    }

    const dayRows = window.activityStarts.slice(0, 7).map((start, index) => {
      const end = window.activityStarts[index + 1]
      return {
        startUtc: start,
        reviews: history.filter((review) => inRange(review.reviewed_at, start, end)).length,
        added: vocabularies.filter((word) => inRange(word.created_at, start, end)).length,
      }
    })

    const latestReviews = [...latestReviewByVocabulary.values()]
    const totalReviews = history.length
    const activeDays = activeDates.size
    const wordCountsBySet = new Map()
    for (const word of vocabularies) {
      if (word.set_id !== null) {
        const key = String(word.set_id)
        wordCountsBySet.set(key, (wordCountsBySet.get(key) || 0) + 1)
      }
    }

    return response.json({
      summary: {
        totalVocabulary: vocabularies.length,
        new: vocabularies.filter((word) => word.status === 'new' || !latestReviewByVocabulary.has(String(word.id))).length,
        learning: vocabularies.filter((word) => word.status === 'learning').length,
        learned: vocabularies.filter((word) => word.status === 'learned').length,
        dueToday: latestReviews.filter((review) => new Date(review.next_review_at).getTime() <= now).length,
        reviewedToday: history.filter((review) => inRange(review.reviewed_at, window.todayStart, window.tomorrowStart)).length,
      },
      ratings: {
        total: totalReviews,
        ...ratingCounts,
        percentages: Object.fromEntries(Object.entries(ratingCounts).map(([rating, value]) => [rating, percentage(value, totalReviews)])),
      },
      performance: { activeDays, averageReviewsPerActiveDay: activeDays > 0 ? Number((totalReviews / activeDays).toFixed(1)) : 0 },
      last7Days: dayRows,
      upcoming: {
        dueThroughToday: latestReviews.filter((review) => new Date(review.next_review_at) < new Date(window.tomorrowStart)).length,
        tomorrow: latestReviews.filter((review) => inRange(review.next_review_at, window.tomorrowStart, window.dayAfterTomorrowStart)).length,
        nextSevenDays: latestReviews.filter((review) => inRange(review.next_review_at, window.dayAfterTomorrowStart, window.nextSevenDaysEnd)).length,
      },
      reviewSets: {
        total: sets.length,
        recent: sets.slice(0, 3).map((set) => ({ ...set, word_count: wordCountsBySet.get(String(set.id)) || 0 })),
      },
      recentActivity: history.slice(0, 5).map((review) => ({
        id: review.id,
        rating: review.rating,
        reviewed_at: review.reviewed_at,
        vocabulary_id: review.vocabulary_id,
        word: vocabularyById.get(String(review.vocabulary_id))?.word || '',
      })),
    })
  })

  return router
}
