import { useEffect, useState } from 'react'
import { deleteVocabulary, getVocabularies, updateVocabulary } from '../api/vocabularies.js'
import VocabularyFormFields from '../components/VocabularyFormFields.jsx'
import { getEnglishDefinition, getVietnameseMeaning } from '../utils/vocabulary.js'

function createEditForm(vocabulary) {
  return {
    word: vocabulary.word || '',
    phonetic: vocabulary.phonetic || '',
    meaning_vi: getVietnameseMeaning(vocabulary),
    meaning_en: getEnglishDefinition(vocabulary),
    part_of_speech: vocabulary.part_of_speech || '',
    example: vocabulary.example || '',
    audio_url: vocabulary.audio_url || '',
    image_url: vocabulary.image_url || '',
    status: vocabulary.status || 'new',
  }
}

const pageSizeOptions = [10, 20, 50]

function pageItems(totalPages, currentPage) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1)

  const items = [1]
  const start = Math.max(2, currentPage - 1)
  const end = Math.min(totalPages - 1, currentPage + 1)

  if (start > 2) items.push('start-ellipsis')
  for (let page = start; page <= end; page += 1) items.push(page)
  if (end < totalPages - 1) items.push('end-ellipsis')
  items.push(totalPages)

  return items
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
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

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

  const totalPages = Math.max(1, Math.ceil(vocabularies.length / pageSize))
  const visiblePage = Math.min(currentPage, totalPages)
  const firstItemIndex = (visiblePage - 1) * pageSize
  const visibleVocabularies = vocabularies.slice(firstItemIndex, firstItemIndex + pageSize)

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages))
  }, [totalPages])

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

  function handlePageSizeChange(event) {
    setPageSize(Number(event.target.value))
    setCurrentPage(1)
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
        <section className="vocabulary-list" aria-label="Vocabulary list">
          <div className="vocabulary-list-toolbar">
            <p>Showing {firstItemIndex + 1}–{Math.min(firstItemIndex + pageSize, vocabularies.length)} of {vocabularies.length} vocabulary {vocabularies.length === 1 ? 'item' : 'items'}</p>
            <label>
              Rows per page
              <select onChange={handlePageSizeChange} value={pageSize}>
                {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          </div>

          <div className="table-wrapper">
            <table>
              <caption className="sr-only">Vocabulary items on the current page</caption>
              <thead>
                <tr>
                  <th scope="col">Word</th>
                  <th scope="col">Vietnamese Meaning</th>
                  <th scope="col">Part of Speech</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleVocabularies.map((vocabulary) => (
                  <tr key={vocabulary.id}>
                    <td>{vocabulary.word}</td>
                    <td>{getVietnameseMeaning(vocabulary) || '—'}</td>
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

          {totalPages > 1 && (
            <nav className="vocabulary-pagination" aria-label="Vocabulary pages">
              <button className="subtle-button" disabled={visiblePage === 1} onClick={() => setCurrentPage((page) => page - 1)} type="button">Previous</button>
              {pageItems(totalPages, visiblePage).map((item) => typeof item === 'number' ? (
                <button
                  aria-current={item === visiblePage ? 'page' : undefined}
                  className={item === visiblePage ? 'active' : ''}
                  key={item}
                  onClick={() => setCurrentPage(item)}
                  type="button"
                >
                  {item}
                </button>
              ) : <span aria-hidden="true" className="vocabulary-pagination-ellipsis" key={item}>…</span>)}
              <button className="subtle-button" disabled={visiblePage === totalPages} onClick={() => setCurrentPage((page) => page + 1)} type="button">Next</button>
            </nav>
          )}
        </section>
      )}
    </>
  )
}

export default VocabularyPage
