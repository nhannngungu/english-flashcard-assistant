import { useState } from 'react'
import { createVocabulary } from '../api/vocabularies.js'

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
      <label>
        Word
        <input name="word" onChange={handleChange} required value={form.word} />
      </label>

      <label>
        Meaning
        <input name="meaning" onChange={handleChange} value={form.meaning} />
      </label>

      <label>
        Part of Speech
        <input name="part_of_speech" onChange={handleChange} value={form.part_of_speech} />
      </label>

      <label>
        Example
        <textarea name="example" onChange={handleChange} rows="3" value={form.example} />
      </label>

      <label>
        Image URL
        <input name="image_url" onChange={handleChange} type="url" value={form.image_url} />
      </label>

      <label>
        Status
        <select name="status" onChange={handleChange} value={form.status}>
          <option value="new">New</option>
          <option value="learning">Learning</option>
          <option value="learned">Learned</option>
        </select>
      </label>

      <button className="primary-button" disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Adding…' : 'Add word'}
      </button>

      {message && <p className="message success-message">{message}</p>}
      {error && <p className="message error-message">Could not add word: {error}</p>}
    </form>
  )
}

export default AddWordsPage
