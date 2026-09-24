import { useEffect, useState } from 'react'
import { deleteVocabulary, getVocabularies, updateVocabulary } from '../api/vocabularies.js'
import VocabularyFormFields from '../components/VocabularyFormFields.jsx'

function createEditForm(vocabulary) {
  return {
    word: vocabulary.word || '',
    meaning: vocabulary.meaning || '',
    part_of_speech: vocabulary.part_of_speech || '',
    example: vocabulary.example || '',
    image_url: vocabulary.image_url || '',
    status: vocabulary.status || 'new',
  }
}

function VocabularyPage({ refreshKey }) {
  const [vocabularies, setVocabularies] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [editingVocabulary, setEditingVocabulary] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

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

  useEffect(() => {
    loadVocabularies()
  }, [refreshKey])

  function startEditing(vocabulary) {
    setMessage('')
    setActionError('')
    setEditingVocabulary(vocabulary)
    setEditForm(createEditForm(vocabulary))
  }

  function handleEditChange(event) {
    const { name, value } = event.target
    setEditForm((currentForm) => ({ ...currentForm, [name]: value }))
  }

  async function saveEdit(event) {
    event.preventDefault()
    setIsSaving(true)
    setMessage('')
    setActionError('')

    try {
      const updatedVocabulary = await updateVocabulary(editingVocabulary.id, editForm)
      setEditingVocabulary(null)
      setEditForm(null)
      setMessage(`“${updatedVocabulary.word}” was updated successfully.`)
      await loadVocabularies()
    } catch (requestError) {
      setActionError(requestError.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(vocabulary) {
    const shouldDelete = window.confirm(`Delete “${vocabulary.word}”? This cannot be undone.`)

    if (!shouldDelete) {
      return
    }

    setDeletingId(vocabulary.id)
    setMessage('')
    setActionError('')

    try {
      await deleteVocabulary(vocabulary.id)
      setMessage(`“${vocabulary.word}” was deleted successfully.`)
      await loadVocabularies()
    } catch (requestError) {
      setActionError(requestError.message)
    } finally {
      setDeletingId(null)
    }
  }

  if (isLoading) {
    return <p className="message" role="status">Loading vocabulary…</p>
  }

  if (error) {
    return <p className="message error-message" role="alert">Could not load vocabulary: {error}</p>
  }

  return (
    <>
      {message && <p className="message success-message" role="status">{message}</p>}
      {actionError && <p className="message error-message" role="alert">Could not complete action: {actionError}</p>}

      {editingVocabulary && (
        <form className="word-form edit-form" onSubmit={saveEdit}>
          <h3>Edit “{editingVocabulary.word}”</h3>
          <VocabularyFormFields form={editForm} onChange={handleEditChange} />
          <div className="form-actions">
            <button className="primary-button" disabled={isSaving} type="submit">
              {isSaving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              className="secondary-button"
              disabled={isSaving}
              onClick={() => setEditingVocabulary(null)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {vocabularies.length === 0 ? (
        <p className="message">No vocabulary items yet. Add your first word from the Add Words page.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <caption className="sr-only">All vocabulary items</caption>
            <thead>
              <tr>
                <th scope="col">Word</th>
                <th scope="col">Meaning</th>
                <th scope="col">Part of Speech</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
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
                  <td>
                    <div className="table-actions">
                      <button className="secondary-button" onClick={() => startEditing(vocabulary)} type="button">
                        Edit
                      </button>
                      <button
                        className="delete-button"
                        disabled={deletingId === vocabulary.id}
                        onClick={() => handleDelete(vocabulary)}
                        type="button"
                      >
                        {deletingId === vocabulary.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export default VocabularyPage
