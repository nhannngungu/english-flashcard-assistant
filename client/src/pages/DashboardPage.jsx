import { useEffect, useState } from 'react'
import { getDashboardStatistics } from '../api/statistics.js'

const emptyStatistics = {
  summary: {
    totalVocabulary: 0,
    new: 0,
    learning: 0,
    learned: 0,
    dueToday: 0,
    reviewedToday: 0,
  },
  ratings: {
    total: 0,
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
    percentages: { again: 0, hard: 0, good: 0, easy: 0 },
  },
  performance: { activeDays: 0, averageReviewsPerActiveDay: 0 },
  last7Days: [],
  upcoming: { dueThroughToday: 0, tomorrow: 0, nextSevenDays: 0 },
  reviewSets: { total: 0, recent: [] },
  recentActivity: [],
}

function sqliteUtcDate(value) {
  if (!value) return null
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatLocalDate(value) {
  const date = sqliteUtcDate(value)
  return date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date) : 'Unknown date'
}

function formatLocalDateTime(value) {
  const date = sqliteUtcDate(value)
  return date
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'Unknown time'
}

function ActivityChart({ days }) {
  const maximum = Math.max(1, ...days.flatMap((day) => [day.reviews, day.added]))
  const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="learning-chart" aria-label="Reviews completed and vocabulary added during the last seven days">
      <div className="learning-chart-legend" aria-hidden="true">
        <span><i className="chart-key-reviews" />Reviews</span>
        <span><i className="chart-key-added" />Added</span>
      </div>
      <div className="learning-chart-days">
        {days.map((day) => {
          const date = new Date(day.startUtc)
          return (
            <div className="learning-chart-day" key={day.startUtc}>
              <div className="learning-chart-bars">
                <div className="learning-chart-bar" title={`${day.reviews} reviews`}>
                  <span>{day.reviews}</span>
                  <i className="chart-reviews" style={{ height: `${Math.max(day.reviews ? 8 : 2, (day.reviews / maximum) * 92)}px` }} />
                </div>
                <div className="learning-chart-bar" title={`${day.added} vocabulary added`}>
                  <span>{day.added}</span>
                  <i className="chart-added" style={{ height: `${Math.max(day.added ? 8 : 2, (day.added / maximum) * 92)}px` }} />
                </div>
              </div>
              <small>{dayLabel.format(date)}</small>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SetCover({ vocabularySet }) {
  const [failed, setFailed] = useState(false)
  return vocabularySet.cover_image_url && !failed
    ? <img alt="" onError={() => setFailed(true)} src={vocabularySet.cover_image_url} />
    : <div className="dashboard-set-placeholder" aria-hidden="true">Aa</div>
}

function DashboardPage({ onNavigate }) {
  const [statistics, setStatistics] = useState(emptyStatistics)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadDashboard() {
      setIsLoading(true)
      setError('')
      try {
        const data = await getDashboardStatistics()
        if (active) setStatistics(data)
      } catch (requestError) {
        if (active) setError(requestError.message)
      } finally {
        if (active) setIsLoading(false)
      }
    }

    loadDashboard()
    return () => { active = false }
  }, [])

  if (isLoading) return <p className="message" role="status">Loading learning statistics…</p>
  if (error) return <p className="message error-message" role="alert">Could not load dashboard: {error}</p>

  const summaryCards = [
    ['Total Vocabulary', statistics.summary.totalVocabulary],
    ['New', statistics.summary.new],
    ['Learning', statistics.summary.learning],
    ['Learned', statistics.summary.learned],
    ['Due Today', statistics.summary.dueToday],
    ['Reviewed Today', statistics.summary.reviewedToday],
  ]
  const ratingRows = ['again', 'hard', 'good', 'easy']

  return (
    <section className="dashboard learning-dashboard">
      <div className="stat-grid learning-summary-grid">
        {summaryCards.map(([label, value]) => (
          <article className="stat-card" key={label}>
            <p>{label}</p>
            <strong>{value}</strong>
          </article>
        ))}
      </div>

      <div className="dashboard-actions">
        <button className="primary-button" onClick={() => onNavigate('review', 'smart')} type="button">Start Smart Review</button>
        <button className="secondary-button" onClick={() => onNavigate('add-words')} type="button">Add Vocabulary</button>
      </div>

      <div className="dashboard-primary-grid">
        <section className="dashboard-panel dashboard-chart-panel" aria-labelledby="learning-activity-title">
          <div className="dashboard-panel-heading">
            <div>
              <h3 id="learning-activity-title">7-Day Learning Activity</h3>
              <p>Reviews completed and new vocabulary saved by local calendar day.</p>
            </div>
          </div>
          <ActivityChart days={statistics.last7Days} />
        </section>

        <section className="dashboard-panel" aria-labelledby="upcoming-review-title">
          <div className="dashboard-panel-heading">
            <div>
              <h3 id="upcoming-review-title">Upcoming Review</h3>
              <p>Latest schedule for each vocabulary item.</p>
            </div>
          </div>
          <div className="upcoming-review-list">
            <div><span>Due through today</span><strong>{statistics.upcoming.dueThroughToday}</strong></div>
            <div><span>Tomorrow</span><strong>{statistics.upcoming.tomorrow}</strong></div>
            <div><span>Next 7 days after tomorrow</span><strong>{statistics.upcoming.nextSevenDays}</strong></div>
          </div>
          <small className="dashboard-footnote">These time ranges do not overlap.</small>
        </section>
      </div>

      <div className="dashboard-secondary-grid">
        <section className="dashboard-panel" aria-labelledby="review-activity-title">
          <div className="dashboard-panel-heading">
            <div>
              <h3 id="review-activity-title">Review Activity</h3>
              <p><strong>{statistics.ratings.total}</strong> total review ratings</p>
            </div>
          </div>
          <div className="rating-distribution">
            {ratingRows.map((rating) => (
              <div className="rating-distribution-row" key={rating}>
                <span className={`rating-name rating-name-${rating}`}>{rating[0].toUpperCase() + rating.slice(1)}</span>
                <div className="rating-track" aria-hidden="true"><i style={{ width: `${statistics.ratings.percentages[rating]}%` }} /></div>
                <strong>{statistics.ratings[rating]}</strong>
                <span>{statistics.ratings.percentages[rating]}%</span>
              </div>
            ))}
          </div>
          <div className="learning-performance">
            <div><span>Average reviews per active day</span><strong>{statistics.performance.averageReviewsPerActiveDay}</strong></div>
            <div><span>Active review days</span><strong>{statistics.performance.activeDays}</strong></div>
          </div>
        </section>

        <section className="dashboard-panel" aria-labelledby="dashboard-review-sets-title">
          <div className="dashboard-panel-heading dashboard-set-heading">
            <div>
              <h3 id="dashboard-review-sets-title">Review Sets</h3>
              <p><strong>{statistics.reviewSets.total}</strong> total {statistics.reviewSets.total === 1 ? 'set' : 'sets'}</p>
            </div>
            <button className="subtle-button" onClick={() => onNavigate('review', 'sets')} type="button">View Review Sets</button>
          </div>
          {statistics.reviewSets.recent.length === 0 ? (
            <p className="message">No review sets yet.</p>
          ) : (
            <div className="dashboard-set-list">
              {statistics.reviewSets.recent.map((set) => (
                <article className="dashboard-set-item" key={set.id}>
                  <SetCover vocabularySet={set} />
                  <div><strong>{set.title}</strong><span>{formatLocalDate(set.created_at)} · {set.word_count} {set.word_count === 1 ? 'word' : 'words'}</span></div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="dashboard-panel" aria-labelledby="recent-activity-title">
        <div className="dashboard-panel-heading">
          <div>
            <h3 id="recent-activity-title">Recent Activity</h3>
            <p>Your five latest review events.</p>
          </div>
        </div>
        {statistics.recentActivity.length === 0 ? (
          <p className="message">No reviews yet. Complete a review to see activity here.</p>
        ) : (
          <ul className="recent-review-list">
            {statistics.recentActivity.map((activity) => (
              <li key={activity.id}>
                <span>Reviewed <strong>“{activity.word}”</strong> → <b className={`recent-rating recent-rating-${activity.rating}`}>{activity.rating[0].toUpperCase() + activity.rating.slice(1)}</b></span>
                <time dateTime={`${activity.reviewed_at.replace(' ', 'T')}Z`}>{formatLocalDateTime(activity.reviewed_at)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}

export default DashboardPage
