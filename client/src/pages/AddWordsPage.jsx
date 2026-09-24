import { useState } from 'react'
import { createVocabulary } from '../api/vocabularies.js'
import VocabularyFormFields from '../components/VocabularyFormFields.jsx'

const initialForm = {
  word: '',
  meaning: '',
  part_of_speech: '',
  example: '',
  image_url: '',
  status: 'new',
}

function AddWordsPage({ onVocabularyCreated }) {
  const [form, setForm] = useState(initialForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function handleChange(event) {
    const { name, value } = event.target
    setForm((currentForm) => ({ ...currentForm, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage('')
    setError('')

    try {
      const vocabulary = await createVocabulary(form)
      setForm(initialForm)
      setMessage(`“${vocabulary.word}” was added successfully.`)
      onVocabularyCreated()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="word-form" onSubmit={handleSubmit}>
      <VocabularyFormFields form={form} onChange={handleChange} />

      <button className="primary-button" disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Adding…' : 'Add word'}
      </button>

      {message && <p className="message success-message" role="status">{message}</p>}
      {error && <p className="message error-message" role="alert">Could not add word: {error}</p>}
    </form>
  )
}

export default AddWordsPage
