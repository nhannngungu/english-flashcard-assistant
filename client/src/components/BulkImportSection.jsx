import { useState } from 'react'
import {
  createVocabulary,
  getVocabularies,
  lookupDictionary,
  lookupImages,
} from '../api/vocabularies.js'
import ImageSuggestions from './ImageSuggestions.jsx'
import { parseBulkWords, runWithConcurrency } from '../utils/bulkImport.js'

const editableFields = [
  ['meaning_vi', 'Vietnamese Meaning'],
  ['meaning_en', 'English Definition'],
  ['part_of_speech', 'Part of Speech'],
  ['example', 'Example'],
]

function createPendingItem(word, index) {
  return {
    id: `bulk-word-${index}`,
    word,
    phonetic: '',
    meaning_vi: '',
    meaning_en: '',
    part_of_speech: '',
    example: '',
    audio_url: '',
    image_url: '',
    imageStatus: 'idle',
    imageSuggestions: [],
    imageError: '',
    imageSearchPage: 1,
    expanded: false,
    translationUnavailable: false,
    status: 'new',
    lookupStatus: 'pending',
    lookupError: '',
    selected: false,
    saveStatus: 'idle',
    saveError: '',
  }
}

function lookupErrorMessage(error) {
  if (error.status === 404) {
    return 'No dictionary entry was found for this word.'
  }

  if (error.status === 400) {
    return error.message
  }

  return 'Dictionary lookup failed. Please try again.'
}

function statusText(item) {
  if (item.lookupStatus === 'pending') return 'Pending lookup'
  if (item.lookupStatus === 'loading') return 'Looking up…'
  if (item.lookupStatus === 'failed') return 'Lookup failed'
  if (item.saveStatus === 'saving') return 'Saving…'
  if (item.saveStatus === 'saved') return 'Saved'
  if (item.saveStatus === 'skipped') return 'Skipped (already exists)'
  if (item.saveStatus === 'failed') return 'Save failed'
  return 'Ready to save'
}

function imageStatusText(item) {
  if (item.imageStatus === 'loading') return 'Image: Finding suggestions…'
  if (item.imageStatus === 'selected') return 'Image selected'
  if (item.imageStatus === 'loaded') return 'Image: Not selected'
  if (item.imageStatus === 'failed' && item.image_url) return 'Image selected (refresh failed)'
  if (item.imageStatus === 'failed') return 'Image: Not selected'
  return 'Image: Not selected'
}

function BulkImportSection({ initialWords = [], onVocabularyCreated = () => {} }) {
  const initialInput = initialWords.join('\n')
  const [input, setInput] = useState(initialInput)
  const [items, setItems] = useState(() => parseBulkWords(initialInput).map(createPendingItem))
  const [inputError, setInputError] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [summary, setSummary] = useState('')
  const [batchError, setBatchError] = useState('')

  function updateItem(id, updates) {
    setItems((currentItems) =>
      currentItems.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    )
  }

  function handlePrepare() {
    const words = parseBulkWords(input)

    setInputError('')
    setSummary('')
    setBatchError('')

    if (words.length === 0) {
      setItems([])
      setInputError('Enter at least one English word to prepare an import.')
      return
    }

    setItems(words.map(createPendingItem))
  }

  async function lookupItem(item) {
    updateItem(item.id, {
      lookupStatus: 'loading',
      lookupError: '',
      saveStatus: 'idle',
      saveError: '',
    })

    try {
      const result = await lookupDictionary(item.word)
      updateItem(item.id, {
        word: result.word || item.word,
        phonetic: result.phonetic || '',
        meaning_vi: result.meaning_vi || '',
        meaning_en: result.meaning_en || '',
        part_of_speech: result.part_of_speech || '',
        example: result.example || '',
        audio_url: result.audio_url || '',
        image_url: '',
        imageStatus: 'idle',
        imageSuggestions: [],
        imageError: '',
        imageSearchPage: 1,
        translationUnavailable: !result.meaning_vi,
        lookupStatus: 'success',
        lookupError: '',
        selected: true,
      })
    } catch (error) {
      updateItem(item.id, {
        lookupStatus: 'failed',
        lookupError: lookupErrorMessage(error),
        selected: false,
      })
    }
  }

  async function handleLookupAll() {
    const itemsToLookup = items.filter((item) => item.lookupStatus !== 'success')

    if (itemsToLookup.length === 0) return

    setIsLookingUp(true)
    setSummary('')
    setBatchError('')

    try {
      await runWithConcurrency(itemsToLookup, lookupItem, 3)
    } finally {
      setIsLookingUp(false)
    }
  }

  async function handleRetry(item) {
    setIsLookingUp(true)
    setSummary('')
    setBatchError('')

    try {
      await lookupItem(item)
    } finally {
      setIsLookingUp(false)
    }
  }

  function handleFieldChange(id, field, value) {
    updateItem(id, { [field]: value, saveStatus: 'idle', saveError: '' })
  }

  function handleSelection(id, selected) {
    updateItem(id, { selected })
  }

  function toggleDetails(id) {
    setItems((currentItems) =>
      currentItems.map((item) => (item.id === id ? { ...item, expanded: !item.expanded } : item)),
    )
  }

  async function handleFindImages(item) {
    const isRefreshing = ['loaded', 'selected'].includes(item.imageStatus)
    const page = isRefreshing ? (item.imageSearchPage % 5) + 1 : item.imageSearchPage

    updateItem(item.id, { imageStatus: 'loading', imageSuggestions: [], imageError: '' })

    try {
      const imageSuggestions = await lookupImages(item.word, {
        partOfSpeech: item.part_of_speech,
        meaningEn: item.meaning_en,
        page,
      })

      if (imageSuggestions.length === 0) {
        updateItem(item.id, {
          imageStatus: 'failed',
          imageError: 'No suitable images found. You can save this word without an image.',
        })
        return
      }

      updateItem(item.id, {
        image_url: '',
        imageStatus: 'loaded',
        imageSuggestions: imageSuggestions.slice(0, 3),
        imageError: '',
        imageSearchPage: page,
      })
    } catch {
      updateItem(item.id, {
        imageStatus: 'failed',
        imageError: 'Image suggestions are unavailable right now. You can save this word without an image.',
      })
    }
  }

  function handleImageSelect(id, image) {
    updateItem(id, {
      image_url: image.image_url,
      imageStatus: 'selected',
      imageError: '',
    })
  }

  function setAllSelected(selected) {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.lookupStatus === 'success' && !['saved', 'skipped'].includes(item.saveStatus)
          ? { ...item, selected }
          : item,
      ),
    )
  }

  async function handleSaveSelected() {
    const selectedItems = items.filter(
      (item) => item.lookupStatus === 'success' && item.selected && item.saveStatus !== 'saved',
    )

    if (selectedItems.length === 0) return

    setIsSaving(true)
    setSummary('')
    setBatchError('')

    let existingWords

    try {
      const existing = await getVocabularies()
      existingWords = new Set(existing.map((item) => item.word.trim().toLocaleLowerCase('en-US')))
    } catch (error) {
      setBatchError(`Could not check existing vocabulary: ${error.message}`)
      setIsSaving(false)
      return
    }

    const result = {
      saved: 0,
      skipped: 0,
      failed: items.filter((item) => item.lookupStatus === 'failed').length,
    }

    for (const item of selectedItems) {
      const normalizedWord = item.word.trim().toLocaleLowerCase('en-US')

      if (existingWords.has(normalizedWord)) {
        result.skipped += 1
        updateItem(item.id, { saveStatus: 'skipped', saveError: '', selected: false })
        continue
      }

      updateItem(item.id, { saveStatus: 'saving', saveError: '' })

      try {
        await createVocabulary({
          word: item.word,
          phonetic: item.phonetic,
          meaning_vi: item.meaning_vi,
          meaning_en: item.meaning_en,
          part_of_speech: item.part_of_speech,
          example: item.example,
          audio_url: item.audio_url,
          image_url: item.image_url,
          status: 'new',
        })
        existingWords.add(normalizedWord)
        result.saved += 1
        updateItem(item.id, { saveStatus: 'saved', saveError: '', selected: false })
      } catch (error) {
        result.failed += 1
        updateItem(item.id, { saveStatus: 'failed', saveError: error.message })
      }
    }

    setSummary(`${result.saved} saved, ${result.skipped} skipped, ${result.failed} failed`)
    setIsSaving(false)

    if (result.saved > 0) {
      onVocabularyCreated()
    }
  }

  const successfulItems = items.filter(
    (item) => item.lookupStatus === 'success' && !['saved', 'skipped'].includes(item.saveStatus),
  )
  const selectedCount = successfulItems.filter((item) => item.selected).length
  const lookupableCount = items.filter((item) => item.lookupStatus !== 'success').length

  return (
    <section className="bulk-import-section" aria-labelledby="bulk-import-title">
      <div>
        <h3 id="bulk-import-title">Import multiple words</h3>
        <p className="section-help">
          Paste words separated by new lines, commas, or semicolons. You can review and edit every successful lookup before saving.
        </p>
      </div>

      <div className="form-field">
        <label htmlFor="bulk-words">Words to import</label>
        <textarea
          id="bulk-words"
          onChange={(event) => setInput(event.target.value)}
          placeholder={'apple\ndog\nschool, beautiful; opportunity'}
          rows="6"
          value={input}
        />
      </div>

      <div className="bulk-actions">
        <button className="secondary-button" disabled={isLookingUp || isSaving} onClick={handlePrepare} type="button">
          Prepare Import
        </button>
        {items.length > 0 && (
          <button className="secondary-button" disabled={isLookingUp || isSaving || lookupableCount === 0} onClick={handleLookupAll} type="button">
            {isLookingUp ? 'Looking Up…' : 'Look Up All'}
          </button>
        )}
      </div>

      {inputError && <p className="message error-message" role="alert">{inputError}</p>}

      {items.length > 0 && (
        <div className="bulk-preview">
          <div className="bulk-preview-heading">
            <p className="message"><strong>{items.length}</strong> unique {items.length === 1 ? 'word' : 'words'} detected</p>
            {successfulItems.length > 0 && (
              <div className="bulk-selection-actions">
                <button className="secondary-button" disabled={isSaving} onClick={() => setAllSelected(true)} type="button">Select All</button>
                <button className="secondary-button" disabled={isSaving} onClick={() => setAllSelected(false)} type="button">Deselect All</button>
              </div>
            )}
          </div>

          <div className="bulk-item-list">
            {items.map((item) => (
              <article className={`bulk-item bulk-item-${item.lookupStatus}`} key={item.id}>
                <div className="bulk-item-header">
                  <label className="bulk-checkbox">
                    <input
                      checked={item.selected}
                      disabled={item.lookupStatus !== 'success' || isSaving || ['saved', 'skipped'].includes(item.saveStatus)}
                      onChange={(event) => handleSelection(item.id, event.target.checked)}
                      type="checkbox"
                    />
                    <span className="bulk-word">{item.word}</span>
                  </label>
                  <div className="bulk-item-header-actions">
                    <span className={`import-status import-status-${item.lookupStatus} import-save-${item.saveStatus}`}>
                      {statusText(item)}
                    </span>
                    {item.lookupStatus === 'success' && (
                      <button
                        aria-expanded={item.expanded}
                        className="subtle-button"
                        onClick={() => toggleDetails(item.id)}
                        type="button"
                      >
                        {item.expanded ? 'Hide details' : 'Edit details'}
                      </button>
                    )}
                  </div>
                </div>

                {item.lookupStatus === 'success' && (
                  <>
                    <dl className="bulk-item-summary">
                      <div>
                        <dt>Phonetic</dt>
                        <dd>{item.phonetic || '—'}</dd>
                      </div>
                      <div className="bulk-summary-meaning">
                        <dt>Vietnamese</dt>
                        <dd>{item.meaning_vi || '—'}</dd>
                      </div>
                      <div>
                        <dt>Part of speech</dt>
                        <dd>{item.part_of_speech || '—'}</dd>
                      </div>
                      <div>
                        <dt>Image</dt>
                        <dd className={`bulk-image-status bulk-image-status-${item.imageStatus}`}>{imageStatusText(item)}</dd>
                      </div>
                    </dl>

                    {item.expanded && (
                      <div className="bulk-item-details">
                        <div className="bulk-edit-grid">
                          {editableFields.map(([field, label]) => (
                            <div className="form-field" key={field}>
                              <label htmlFor={`${item.id}-${field}`}>{label}</label>
                              {field === 'part_of_speech' ? (
                                <input
                                  disabled={isSaving || ['saved', 'skipped'].includes(item.saveStatus)}
                                  id={`${item.id}-${field}`}
                                  onChange={(event) => handleFieldChange(item.id, field, event.target.value)}
                                  value={item[field]}
                                />
                              ) : (
                                <textarea
                                  disabled={isSaving || ['saved', 'skipped'].includes(item.saveStatus)}
                                  id={`${item.id}-${field}`}
                                  onChange={(event) => handleFieldChange(item.id, field, event.target.value)}
                                  rows="2"
                                  value={item[field]}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                        {item.translationUnavailable && (
                          <p className="message notice-message" role="status">
                            Vietnamese translation is unavailable. You can enter it manually.
                          </p>
                        )}

                        <section className="bulk-image-section" aria-label={`Image selection for ${item.word}`}>
                          <div className="bulk-image-heading">
                            <h4>Image suggestions</h4>
                            <button
                              className={['loaded', 'selected'].includes(item.imageStatus) ? 'subtle-button' : 'secondary-button'}
                              disabled={isSaving || item.imageStatus === 'loading'}
                              onClick={() => handleFindImages(item)}
                              type="button"
                            >
                              {item.imageStatus === 'loading'
                                ? 'Finding Images…'
                                : ['loaded', 'selected'].includes(item.imageStatus)
                                  ? 'Refresh Images'
                                  : item.imageStatus === 'failed' ? 'Retry' : 'Find Images'}
                            </button>
                          </div>

                          {item.imageSuggestions.length > 0 && item.imageStatus !== 'loading' && (
                            <ImageSuggestions
                              images={item.imageSuggestions}
                              onSelect={(image) => handleImageSelect(item.id, image)}
                              selectedUrl={item.image_url}
                            />
                          )}
                          {item.imageError && <p className="message error-message" role="alert">{item.imageError}</p>}
                        </section>
                        {item.saveStatus === 'failed' && (
                          <p className="message error-message" role="alert">Could not save: {item.saveError}</p>
                        )}
                      </div>
                    )}
                  </>
                )}

                {item.lookupStatus === 'failed' && (
                  <div className="bulk-item-error">
                    <p className="message error-message" role="alert">{item.lookupError}</p>
                    <button className="subtle-button" disabled={isLookingUp || isSaving} onClick={() => handleRetry(item)} type="button">Retry</button>
                  </div>
                )}
              </article>
            ))}
          </div>

          {successfulItems.length > 0 && (
            <button className="primary-button" disabled={isLookingUp || isSaving || selectedCount === 0} onClick={handleSaveSelected} type="button">
              {isSaving ? 'Saving…' : `Save Selected (${selectedCount})`}
            </button>
          )}
        </div>
      )}

      {summary && <p className="message success-message bulk-summary" role="status">{summary}</p>}
      {batchError && <p className="message error-message bulk-summary" role="alert">{batchError}</p>}
    </section>
  )
}

export default BulkImportSection
