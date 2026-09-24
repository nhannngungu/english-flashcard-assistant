import { useEffect, useState } from 'react'
import { getVocabularies } from '../api/vocabularies.js'
import { getVietnameseMeaning } from '../utils/vocabulary.js'

function DashboardPage({ onNavigate }) {
  const [vocabularies, setVocabularies] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadDashboard() {
      setIsLoading(true)
      setError('')

      try {
        const data = await getVocabularies()
        setVocabularies(data)
      } catch (requestError) {
        setError(requestError.message)
      } finally {
        setIsLoading(false)
      }
    }

    loadDashboard()
  }, [])

  if (isLoading) {
    return <p className="message" role="status">Loading dashboard…</p>
  }

  if (error) {
    return <p className="message error-message" role="alert">Could not load dashboard: {error}</p>
  }

  const statistics = vocabularies.reduce(
    (counts, vocabulary) => {
      counts.total += 1
      counts[vocabulary.status] += 1

      if (vocabulary.status === 'new' || vocabulary.status === 'learning') {
        counts.needReview += 1
      }

      return counts
    },
    { total: 0, new: 0, learning: 0, learned: 0, needReview: 0 },
  )

  const recentVocabularies = [...vocabularies]
    .sort((first, second) => {
      const firstDate = new Date(first.created_at).getTime()
      const secondDate = new Date(second.created_at).getTime()
      return secondDate - firstDate || second.id - first.id
    })
    .slice(0, 5)

  const statisticCards = [
    { label: 'Total Vocabulary', value: statistics.total },
    { label: 'New', value: statistics.new },
    { label: 'Learning', value: statistics.learning },
    { label: 'Learned', value: statistics.learned },
    { label: 'Need Review', value: statistics.needReview },
  ]

  return (
    <section className="dashboard">
      <div className="stat-grid">
        {statisticCards.map((card) => (
          <article className="stat-card" key={card.label}>
            <p>{card.label}</p>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>

      <div className="dashboard-actions">
        <button className="primary-button" onClick={() => onNavigate('add-words')} type="button">
          Add Vocabulary
        </button>
        <button className="secondary-button" onClick={() => onNavigate('review')} type="button">
          Start Review
        </button>
      </div>

      <section className="recent-vocabulary">
        <h3>Recent Vocabulary</h3>
        {recentVocabularies.length === 0 ? (
          <p className="message">No vocabulary items yet. Add your first word to get started.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <caption className="sr-only">Five most recently created vocabulary items</caption>
              <thead>
                <tr>
                  <th scope="col">Word</th>
                  <th scope="col">Vietnamese Meaning</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentVocabularies.map((vocabulary) => (
                  <tr key={vocabulary.id}>
                    <td>{vocabulary.word}</td>
                    <td>{getVietnameseMeaning(vocabulary) || '—'}</td>
                    <td>
                      <span className={`status status-${vocabulary.status}`}>{vocabulary.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}

export default DashboardPage
