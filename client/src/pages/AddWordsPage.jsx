import { useEffect, useState } from 'react'
import { createVocabulary, lookupDictionary, lookupImages } from '../api/vocabularies.js'
import { createVocabularySet, getAllVocabularySets } from '../api/vocabularySets.js'
import BulkImportSection from '../components/BulkImportSection.jsx'
import ImageSuggestions from '../components/ImageSuggestions.jsx'
import VocabularyFormFields from '../components/VocabularyFormFields.jsx'
import VocabularySetFields from '../components/VocabularySetFields.jsx'

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
  const [mode, setMode] = useState('single')
  const [form, setForm] = useState(initialForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [dictionarySource, setDictionarySource] = useState('')
  const [translationSource, setTranslationSource] = useState('')
  const [translationNotice, setTranslationNotice] = useState('')
  const [canFindImages, setCanFindImages] = useState(false)
  const [imageSuggestions, setImageSuggestions] = useState([])
  const [isFindingImages, setIsFindingImages] = useState(false)
  const [hasSearchedImages, setHasSearchedImages] = useState(false)
  const [imageLookupError, setImageLookupError] = useState('')
  const [imageSearchPage, setImageSearchPage] = useState(1)
  const [setChoice, setSetChoice] = useState('none')
  const [existingSetId, setExistingSetId] = useState('')
  const [availableSets, setAvailableSets] = useState([])
  const [setTitle, setSetTitle] = useState('')
  const [setCoverImageUrl, setSetCoverImageUrl] = useState('')
  const [setLoadError, setSetLoadError] = useState('')

  useEffect(() => {
    let active = true

    getAllVocabularySets()
      .then((sets) => {
        if (active) setAvailableSets(sets)
      })
      .catch((requestError) => {
        if (active) setSetLoadError(requestError.message)
      })

    return () => { active = false }
  }, [])

  function handleChange(event) {
    const { name, value } = event.target

    if (name === 'word') {
      setLookupError('')
      setDictionarySource('')
      setTranslationSource('')
      setTranslationNotice('')
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
    setTranslationNotice('')
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
      setTranslationNotice(
        dictionaryEntry.meaning_vi ? '' : 'Vietnamese translation is unavailable. You can enter it manually.',
      )
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
      let setId = null
      let createdSet = null

      if (setChoice === 'existing') {
        if (!existingSetId) throw new Error('Choose an existing vocabulary set.')
        setId = Number(existingSetId)
      } else if (setChoice === 'new') {
        const vocabularySet = await createVocabularySet({
          title: setTitle,
          cover_image_url: setCoverImageUrl,
        })
        createdSet = vocabularySet
        setId = vocabularySet.id
        setAvailableSets((sets) => [{ ...vocabularySet, word_count: 0 }, ...sets])
      }

      const vocabulary = await createVocabulary({ ...form, set_id: setId })
      setForm(initialForm)
      setDictionarySource('')
      setTranslationSource('')
      setTranslationNotice('')
      setLookupError('')
      setCanFindImages(false)
      setImageSuggestions([])
      setHasSearchedImages(false)
      setImageLookupError('')
      setImageSearchPage(1)
      setSetTitle('')
      setSetCoverImageUrl('')
      if (createdSet) {
        setSetChoice('existing')
        setExistingSetId(String(createdSet.id))
      }
      setMessage(`“${vocabulary.word}” was added successfully.`)
      onVocabularyCreated()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="add-words-layout">
      <div className="add-mode-switch" aria-label="Add words mode">
        <button
          aria-pressed={mode === 'single'}
          className={`add-mode-button${mode === 'single' ? ' active' : ''}`}
          id="single-word-tab"
          onClick={() => setMode('single')}
          type="button"
        >
          Single Word
        </button>
        <button
          aria-pressed={mode === 'bulk'}
          className={`add-mode-button${mode === 'bulk' ? ' active' : ''}`}
          id="bulk-import-tab"
          onClick={() => setMode('bulk')}
          type="button"
        >
          Bulk Import
        </button>
      </div>

      <section
        aria-labelledby="single-word-title"
        className="single-word-panel"
        hidden={mode !== 'single'}
        id="single-word-panel"
      >
        <div className="add-section-heading">
          <div>
            <h3 id="single-word-title">Add a single word</h3>
            <p>Look up a word first, then review or adjust its details before adding it.</p>
          </div>
        </div>
        <form className="word-form" onSubmit={handleSubmit}>
          <VocabularyFormFields
            form={form}
            isLookingUp={isLookingUp}
            layout="two-column"
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
          {translationNotice && <p className="message notice-message" role="status">{translationNotice}</p>}
          {lookupError && <p className="message error-message" role="alert">{lookupError}</p>}

          {canFindImages && (
            <section className="image-suggestion-section" aria-labelledby="image-suggestions-title">
              <div className="image-suggestion-heading">
                <h3 id="image-suggestions-title">Image Suggestions</h3>
                <button
                  className={hasSearchedImages ? 'subtle-button' : 'secondary-button'}
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

          <section className="manual-set-assignment" aria-labelledby="manual-set-title">
            <div>
              <h3 id="manual-set-title">Vocabulary set</h3>
              <p>Add this word without a set, attach it to an existing set, or start a new set.</p>
            </div>
            <div className="set-choice-row" role="radiogroup" aria-label="Vocabulary set choice">
              {[
                ['none', 'No set'],
                ['existing', 'Existing set'],
                ['new', 'New set'],
              ].map(([value, label]) => (
                <label key={value}>
                  <input checked={setChoice === value} name="set-choice" onChange={() => setSetChoice(value)} type="radio" />
                  {label}
                </label>
              ))}
            </div>
            {setChoice === 'existing' && (
              <div className="form-field">
                <label htmlFor="manual-existing-set">Choose set</label>
                <select id="manual-existing-set" onChange={(event) => setExistingSetId(event.target.value)} value={existingSetId}>
                  <option value="">Select a vocabulary set</option>
                  {availableSets.map((set) => <option key={set.id} value={set.id}>{set.title} ({set.word_count})</option>)}
                </select>
                {setLoadError && <small className="error-text">Could not load sets: {setLoadError}</small>}
              </div>
            )}
            {setChoice === 'new' && (
              <VocabularySetFields
                candidateImages={[form.image_url]}
                coverImageUrl={setCoverImageUrl}
                idPrefix="manual-new-set"
                onCoverImageUrlChange={setSetCoverImageUrl}
                onTitleChange={setSetTitle}
                title={setTitle}
              />
            )}
          </section>

          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Adding…' : 'Add Word'}
          </button>

          {message && <p className="message success-message" role="status">{message}</p>}
          {error && <p className="message error-message" role="alert">Could not add word: {error}</p>}
        </form>
      </section>

      <div hidden={mode !== 'bulk'} id="bulk-import-panel">
        <BulkImportSection onVocabularyCreated={onVocabularyCreated} />
      </div>
    </div>
  )
}

export default AddWordsPage
