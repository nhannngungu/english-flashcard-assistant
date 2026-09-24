import { useEffect, useState } from 'react'
import { getVocabularies } from '../api/vocabularies.js'

function VocabularyPage({ refreshKey }) {
  const [vocabularies, setVocabularies] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadVocabularies() {
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

    loadVocabularies()
  }, [refreshKey])

  if (isLoading) {
    return <p className="message">Loading vocabulary…</p>
  }

  if (error) {
    return <p className="message error-message">Could not load vocabulary: {error}</p>
  }

  if (vocabularies.length === 0) {
    return <p className="message">No vocabulary items yet. Add your first word from the Add Words page.</p>
  }

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Word</th>
            <th>Meaning</th>
            <th>Part of Speech</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {vocabularies.map((vocabulary) => (
            <tr key={vocabulary.id}>
              <td>{vocabulary.word}</td>
              <td>{vocabulary.meaning || '—'}</td>
              <td>{vocabulary.part_of_speech || '—'}</td>
              <td>
                <span className={`status status-${vocabulary.status}`}>{vocabulary.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default VocabularyPage
