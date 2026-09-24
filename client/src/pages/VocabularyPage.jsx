import { useEffect, useState } from 'react'
import { deleteVocabulary, getVocabularies, updateVocabulary } from '../api/vocabularies.js'

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
    return <p className="message">Loading vocabulary…</p>
  }

  if (error) {
    return <p className="message error-message">Could not load vocabulary: {error}</p>
  }

  return (
    <>
      {message && <p className="message success-message">{message}</p>}
      {actionError && <p className="message error-message">Could not complete action: {actionError}</p>}

      {editingVocabulary && (
        <form className="word-form edit-form" onSubmit={saveEdit}>
          <h3>Edit “{editingVocabulary.word}”</h3>
          <label>
            Word
            <input name="word" onChange={handleEditChange} required value={editForm.word} />
          </label>
          <label>
            Meaning
            <input name="meaning" onChange={handleEditChange} value={editForm.meaning} />
          </label>
          <label>
            Part of Speech
            <input name="part_of_speech" onChange={handleEditChange} value={editForm.part_of_speech} />
          </label>
          <label>
            Example
            <textarea name="example" onChange={handleEditChange} rows="3" value={editForm.example} />
          </label>
          <label>
            Image URL
            <input name="image_url" onChange={handleEditChange} type="url" value={editForm.image_url} />
          </label>
          <label>
            Status
            <select name="status" onChange={handleEditChange} value={editForm.status}>
              <option value="new">New</option>
              <option value="learning">Learning</option>
              <option value="learned">Learned</option>
            </select>
          </label>
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
            <thead>
              <tr>
                <th>Word</th>
                <th>Meaning</th>
                <th>Part of Speech</th>
                <th>Status</th>
                <th>Actions</th>
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
