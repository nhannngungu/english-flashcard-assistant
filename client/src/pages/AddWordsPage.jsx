import { useState } from 'react'
import { createVocabulary, lookupDictionary, lookupImages } from '../api/vocabularies.js'
import ImageSuggestions from '../components/ImageSuggestions.jsx'
import VocabularyFormFields from '../components/VocabularyFormFields.jsx'

const initialForm = {
  word: '',
  phonetic: '',
  meaning_vi: '',
  meaning_en: '',
  part_of_speech: '',
  example: '',
  audio_url: '',
  image_url: '',
  status: 'new',
}

function AddWordsPage({ onVocabularyCreated }) {
  const [form, setForm] = useState(initialForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [dictionarySource, setDictionarySource] = useState('')
  const [translationSource, setTranslationSource] = useState('')
  const [canFindImages, setCanFindImages] = useState(false)
  const [imageSuggestions, setImageSuggestions] = useState([])
  const [isFindingImages, setIsFindingImages] = useState(false)
  const [hasSearchedImages, setHasSearchedImages] = useState(false)
  const [imageLookupError, setImageLookupError] = useState('')
  const [imageSearchPage, setImageSearchPage] = useState(1)

  function handleChange(event) {
    const { name, value } = event.target

    if (name === 'word') {
      setLookupError('')
      setDictionarySource('')
      setTranslationSource('')
      setCanFindImages(false)
      setImageSuggestions([])
      setHasSearchedImages(false)
      setImageLookupError('')
      setImageSearchPage(1)
    }

    setForm((currentForm) => ({ ...currentForm, [name]: value }))
  }

  async function handleLookup() {
    setIsLookingUp(true)
    setLookupError('')
    setDictionarySource('')
    setTranslationSource('')
    setCanFindImages(false)
    setImageSuggestions([])
    setHasSearchedImages(false)
    setImageLookupError('')
    setImageSearchPage(1)

    try {
      const dictionaryEntry = await lookupDictionary(form.word)
      setForm((currentForm) => ({
        ...currentForm,
        word: dictionaryEntry.word || currentForm.word,
        phonetic: dictionaryEntry.phonetic || currentForm.phonetic,
        part_of_speech: dictionaryEntry.part_of_speech || currentForm.part_of_speech,
        meaning_vi: dictionaryEntry.meaning_vi || currentForm.meaning_vi,
        meaning_en: dictionaryEntry.meaning_en || currentForm.meaning_en,
        example: dictionaryEntry.example || currentForm.example,
        audio_url: dictionaryEntry.audio_url || currentForm.audio_url,
      }))
      setDictionarySource(dictionaryEntry.source || '')
      setTranslationSource(dictionaryEntry.translation_source || '')
      setCanFindImages(true)
    } catch (requestError) {
      if (requestError.status === 404) {
        setLookupError('Word not found. You can still enter the information manually.')
      } else {
        setLookupError('Dictionary lookup is unavailable. You can still enter the information manually.')
      }
    } finally {
      setIsLookingUp(false)
    }
  }

  async function handleFindImages() {
    setIsFindingImages(true)
    setHasSearchedImages(false)
    setImageLookupError('')
    setImageSuggestions([])
    const page = hasSearchedImages ? (imageSearchPage % 5) + 1 : imageSearchPage

    try {
      const images = await lookupImages(form.word, {
        partOfSpeech: form.part_of_speech,
        meaningEn: form.meaning_en,
        page,
      })
      setImageSuggestions(images)
      setHasSearchedImages(true)
      setImageSearchPage(page)
    } catch {
      setImageLookupError('Image suggestions are unavailable. You can still enter an Image URL manually.')
    } finally {
      setIsFindingImages(false)
    }
  }

  function handleImageSelect(image) {
    setForm((currentForm) => ({ ...currentForm, image_url: image.image_url }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage('')
    setError('')

    try {
      const vocabulary = await createVocabulary(form)
      setForm(initialForm)
      setDictionarySource('')
      setTranslationSource('')
      setLookupError('')
      setCanFindImages(false)
      setImageSuggestions([])
      setHasSearchedImages(false)
      setImageLookupError('')
      setImageSearchPage(1)
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
      <VocabularyFormFields
        form={form}
        isLookingUp={isLookingUp}
        onChange={handleChange}
        onLookup={handleLookup}
        showPronunciation
      />

      {(dictionarySource || translationSource) && (
        <div className="lookup-sources" role="status">
          {dictionarySource && <p>Dictionary source: {dictionarySource}</p>}
          {translationSource && <p>Translation source: {translationSource}</p>}
        </div>
      )}
      {lookupError && <p className="message error-message" role="alert">{lookupError}</p>}

      {canFindImages && (
        <section className="image-suggestion-section" aria-labelledby="image-suggestions-title">
          <div className="image-suggestion-heading">
            <h3 id="image-suggestions-title">Image Suggestions</h3>
            <button
              className="secondary-button"
              disabled={isFindingImages}
              onClick={handleFindImages}
              type="button"
            >
              {isFindingImages ? 'Finding images…' : hasSearchedImages ? 'Refresh Images' : 'Find Images'}
            </button>
          </div>

          {imageSuggestions.length > 0 && (
            <ImageSuggestions
              images={imageSuggestions}
              onSelect={handleImageSelect}
              selectedUrl={form.image_url}
            />
          )}
          {hasSearchedImages && imageSuggestions.length === 0 && (
            <p className="message">
              No good image suggestions were found. This word may be abstract or ambiguous. You can still enter an Image URL manually.
            </p>
          )}
          {imageLookupError && <p className="message error-message" role="alert">{imageLookupError}</p>}
        </section>
      )}

      <button className="primary-button" disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Adding…' : 'Add word'}
      </button>

      {message && <p className="message success-message" role="status">{message}</p>}
      {error && <p className="message error-message" role="alert">Could not add word: {error}</p>}
    </form>
  )
}

export default AddWordsPage
