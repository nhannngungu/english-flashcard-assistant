import { useRef, useState } from 'react'
import { prepareVocabularyFromContext, translatePreparedDefinition } from '../api/analysis.js'
import { createVocabulary, getVocabularies } from '../api/vocabularies.js'
import VocabularySetSavePanel from './VocabularySetSavePanel.jsx'

function editableItem(item, index) {
  return {
    ...item,
    id: `prepared-${index}-${item.normalized}`,
    dirty_fields: [],
    alternative_status: 'idle',
    save_status: 'idle',
    save_error: '',
  }
}

function normalizedVocabularyKey(value) {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US')
    : ''
}

function PreparedVocabularyCards({ initialItems, onVocabularyCreated = () => {} }) {
  const [items, setItems] = useState(() => initialItems.map(editableItem))
  const [activeIndex, setActiveIndex] = useState(0)
  const [retryingId, setRetryingId] = useState('')
  const translationRevisions = useRef(new Map())

  function updateItem(id, update) {
    setItems((currentItems) => currentItems.map((item) => {
      if (item.id !== id) return item
      return typeof update === 'function' ? update(item) : { ...item, ...update }
    }))
  }

  function handleFieldChange(id, field, value) {
    updateItem(id, (item) => ({
      ...item,
      [field]: value,
      dirty_fields: [...new Set([...item.dirty_fields, field])],
      save_status: 'idle',
      save_error: '',
    }))
  }

  async function handleAlternative(item, alternative) {
    const revision = (translationRevisions.current.get(item.id) || 0) + 1
    translationRevisions.current.set(item.id, revision)

    updateItem(item.id, (current) => ({
      ...current,
      part_of_speech: alternative.part_of_speech || '',
      meaning_en: alternative.meaning_en || '',
      meaning_vi: '',
      example: alternative.example || '',
      example_source: alternative.example_source || '',
      source: alternative.source || '',
      ambiguous: false,
      ambiguity_message: '',
      alternative_status: 'translating',
      dirty_fields: current.dirty_fields.filter((field) =>
        !['part_of_speech', 'meaning_en', 'meaning_vi', 'example'].includes(field),
      ),
      save_status: 'idle',
      save_error: '',
    }))

    try {
      const translation = await translatePreparedDefinition(alternative.meaning_en)

      updateItem(item.id, (current) => {
        if (translationRevisions.current.get(item.id) !== revision) return current

        return {
          ...current,
          meaning_vi: current.dirty_fields.includes('meaning_vi')
            ? current.meaning_vi
            : translation.meaning_vi || '',
          translation_source: translation.translation_source || '',
          alternative_status: translation.meaning_vi ? 'idle' : 'translation-unavailable',
        }
      })
    } catch {
      updateItem(item.id, (current) => (
        translationRevisions.current.get(item.id) === revision
          ? { ...current, alternative_status: 'translation-unavailable' }
          : current
      ))
    }
  }

  async function handleRetry(item) {
    setRetryingId(item.id)

    try {
      const result = await prepareVocabularyFromContext([{
        word: item.word,
        normalized: item.normalized,
        cefr_level: item.cefr_level,
        sentence: item.sentence,
        surrounding_context: item.surrounding_context,
      }])
      const [retriedItem] = result.items || []

      if (retriedItem) {
        updateItem(item.id, {
          ...editableItem(retriedItem, 0),
          id: item.id,
        })
      }
    } catch (error) {
      updateItem(item.id, { error: error.message })
    } finally {
      setRetryingId('')
    }
  }

  async function handleSave(item) {
    updateItem(item.id, { save_status: 'saving', save_error: '' })

    try {
      const existingVocabulary = await getVocabularies()
      const wordKey = normalizedVocabularyKey(item.word)
      const alreadyExists = existingVocabulary.some((entry) => normalizedVocabularyKey(entry.word) === wordKey)

      if (alreadyExists) {
        updateItem(item.id, { existing: true, save_status: 'skipped', save_error: '' })
        return
      }

      await createVocabulary({
        word: item.word,
        phonetic: item.phonetic,
        meaning_vi: item.meaning_vi,
        meaning_en: item.meaning_en,
        part_of_speech: item.part_of_speech,
        example: item.example,
        audio_url: item.audio_url || '',
        image_url: '',
        status: 'new',
      })
      updateItem(item.id, { save_status: 'saved', save_error: '' })
      onVocabularyCreated()
    } catch (error) {
      updateItem(item.id, { save_status: 'failed', save_error: error.message })
    }
  }

  const activeItem = items[activeIndex] || items[0]

  function selectItem(index) {
    if (index >= 0 && index < items.length) setActiveIndex(index)
  }

  return (
    <section className="context-prepared" aria-labelledby="context-prepared-title">
      <div>
        <h4 id="context-prepared-title">Prepared vocabulary</h4>
        <p>Review the context-selected meanings. Saving remains a separate manual action.</p>
      </div>

      {items.length > 1 && (
        <>
          <div className="prepared-word-list" aria-label="Prepared vocabulary list">
            {items.map((item, index) => (
              <button
                aria-pressed={index === activeIndex}
                className={`prepared-word-option${index === activeIndex ? ' active' : ''}`}
                key={item.id}
                onClick={() => selectItem(index)}
                type="button"
              >
                {item.word || item.normalized || `Item ${index + 1}`}
              </button>
            ))}
          </div>
          <div className="prepared-card-navigation">
            <button className="subtle-button" disabled={activeIndex === 0} onClick={() => selectItem(activeIndex - 1)} type="button">Previous</button>
            <span>{activeIndex + 1} of {items.length}</span>
            <button className="subtle-button" disabled={activeIndex === items.length - 1} onClick={() => selectItem(activeIndex + 1)} type="button">Next</button>
          </div>
        </>
      )}

      {activeItem && (
        <div className="context-card-list">
          <article className={`context-card context-card-${activeItem.status}`} key={activeItem.id}>
            <div className="context-card-heading">
              <div>
                <h5>{activeItem.word || activeItem.normalized}</h5>
                <span className="context-cefr">CEFR {activeItem.cefr_level}</span>
              </div>
              <div className="context-card-statuses">
                {activeItem.existing && <span className="context-existing">Already in vocabulary</span>}
                {activeItem.status === 'prepared' && (
                  <span className={`context-confidence confidence-${activeItem.sense_confidence}`}>
                    Sense confidence: {activeItem.sense_confidence}
                  </span>
                )}
              </div>
            </div>

            <div className="context-source-sentence">
              <strong>Original context</strong>
              <blockquote>{activeItem.sentence || 'No sentence context was available.'}</blockquote>
            </div>

            {activeItem.status === 'failed' ? (
              <div className="context-prepare-error">
                <p className="message error-message" role="alert">{activeItem.error}</p>
                <button
                  className="subtle-button"
                  disabled={retryingId === activeItem.id}
                  onClick={() => handleRetry(activeItem)}
                  type="button"
                >
                  {retryingId === activeItem.id ? 'Retrying…' : 'Retry'}
                </button>
              </div>
            ) : (
              <>
                {activeItem.ambiguous && (
                  <p className="message notice-message context-ambiguity" role="status">
                    Meaning may be ambiguous. Review the alternatives before saving.
                  </p>
                )}

                <div className="context-fields">
                  <div className="form-field">
                    <label htmlFor={`${activeItem.id}-word`}>Word</label>
                    <input id={`${activeItem.id}-word`} onChange={(event) => handleFieldChange(activeItem.id, 'word', event.target.value)} value={activeItem.word} />
                  </div>
                  <div className="form-field">
                    <label htmlFor={`${activeItem.id}-phonetic`}>Phonetic</label>
                    <input id={`${activeItem.id}-phonetic`} onChange={(event) => handleFieldChange(activeItem.id, 'phonetic', event.target.value)} value={activeItem.phonetic || ''} />
                  </div>
                  <div className="form-field">
                    <label htmlFor={`${activeItem.id}-part-of-speech`}>Part of Speech</label>
                    <input id={`${activeItem.id}-part-of-speech`} onChange={(event) => handleFieldChange(activeItem.id, 'part_of_speech', event.target.value)} value={activeItem.part_of_speech || ''} />
                  </div>
                  <div className="form-field context-field-half">
                    <label htmlFor={`${activeItem.id}-meaning-vi`}>Vietnamese Meaning</label>
                    <textarea id={`${activeItem.id}-meaning-vi`} onChange={(event) => handleFieldChange(activeItem.id, 'meaning_vi', event.target.value)} rows="2" value={activeItem.meaning_vi || ''} />
                  </div>
                  <div className="form-field context-field-half">
                    <label htmlFor={`${activeItem.id}-meaning-en`}>English Meaning</label>
                    <textarea id={`${activeItem.id}-meaning-en`} onChange={(event) => handleFieldChange(activeItem.id, 'meaning_en', event.target.value)} rows="3" value={activeItem.meaning_en || ''} />
                  </div>
                  <div className="form-field context-field-wide">
                    <label htmlFor={`${activeItem.id}-example`}>Example</label>
                    <textarea id={`${activeItem.id}-example`} onChange={(event) => handleFieldChange(activeItem.id, 'example', event.target.value)} rows="3" value={activeItem.example || ''} />
                    {activeItem.example_source && <span className="context-field-source">Source: {activeItem.example_source}</span>}
                  </div>
                </div>

                {activeItem.alternative_status === 'translating' && (
                  <p className="message" role="status">Refreshing the Vietnamese meaning for the selected definition…</p>
                )}
                {activeItem.alternative_status === 'translation-unavailable' && (
                  <p className="message notice-message" role="status">Vietnamese translation is unavailable. The selected English meaning was kept.</p>
                )}

                {activeItem.alternatives?.length > 0 && (
                  <details className="context-alternatives" open={activeItem.ambiguous}>
                    <summary>Other meanings ({activeItem.alternatives.length})</summary>
                    <div className="context-alternative-list">
                      {activeItem.alternatives.map((alternative, alternativeIndex) => (
                        <div className="context-alternative" key={`${activeItem.id}-alternative-${alternativeIndex}`}>
                          <div>
                            <strong>{alternative.part_of_speech || 'Meaning'}</strong>
                            <p>{alternative.meaning_en}</p>
                            {alternative.example && <small>Example: {alternative.example}</small>}
                            <small>Source: {alternative.source || 'dictionary'}</small>
                          </div>
                          <button className="subtle-button" onClick={() => handleAlternative(activeItem, alternative)} type="button">Use this meaning</button>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                <div className="context-card-footer">
                  <span>Dictionary source: {activeItem.source || 'Unavailable'}</span>
                  <button
                    className="primary-button"
                    disabled={activeItem.existing || ['saving', 'saved', 'skipped'].includes(activeItem.save_status)}
                    onClick={() => handleSave(activeItem)}
                    type="button"
                  >
                    {activeItem.existing || activeItem.save_status === 'skipped'
                      ? 'Already in vocabulary'
                      : activeItem.save_status === 'saving' ? 'Saving…' : activeItem.save_status === 'saved' ? 'Saved' : 'Save Vocabulary'}
                  </button>
                </div>
                {activeItem.save_status === 'failed' && <p className="message error-message" role="alert">Could not save: {activeItem.save_error}</p>}
              </>
            )}
          </article>
        </div>
      )}

      <VocabularySetSavePanel
        heading="Save all prepared words as one set"
        idPrefix={`prepared-vocabulary-set-${initialItems.length}`}
        items={items}
        onVocabularyCreated={onVocabularyCreated}
      />
    </section>
  )
}

export default PreparedVocabularyCards
