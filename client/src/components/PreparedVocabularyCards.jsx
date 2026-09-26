import { useRef, useState } from 'react'
import { prepareVocabularyFromContext, translatePreparedDefinition } from '../api/analysis.js'
import { createVocabulary, getVocabularies } from '../api/vocabularies.js'

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

  return (
    <section className="context-prepared" aria-labelledby="context-prepared-title">
      <div>
        <h4 id="context-prepared-title">Prepared vocabulary</h4>
        <p>Review the context-selected meanings. Saving remains a separate manual action.</p>
      </div>

      <div className="context-card-list">
        {items.map((item, index) => (
          <article className={`context-card context-card-${item.status}`} key={item.id}>
            <div className="context-card-heading">
              <div>
                <h5>{item.word || item.normalized}</h5>
                <span className="context-cefr">CEFR {item.cefr_level}</span>
              </div>
              <div className="context-card-statuses">
                {item.existing && <span className="context-existing">Already in vocabulary</span>}
                {item.status === 'prepared' && (
                  <span className={`context-confidence confidence-${item.sense_confidence}`}>
                    Sense confidence: {item.sense_confidence}
                  </span>
                )}
              </div>
            </div>

            <div className="context-source-sentence">
              <strong>Original context</strong>
              <blockquote>{item.sentence || 'No sentence context was available.'}</blockquote>
            </div>

            {item.status === 'failed' ? (
              <div className="context-prepare-error">
                <p className="message error-message" role="alert">{item.error}</p>
                <button
                  className="subtle-button"
                  disabled={retryingId === item.id}
                  onClick={() => handleRetry(item)}
                  type="button"
                >
                  {retryingId === item.id ? 'Retrying…' : 'Retry'}
                </button>
              </div>
            ) : (
              <>
                {item.ambiguous && (
                  <p className="message notice-message context-ambiguity" role="status">
                    Meaning may be ambiguous. Review the alternatives before saving.
                  </p>
                )}

                <div className="context-fields">
                  <div className="form-field">
                    <label htmlFor={`${item.id}-word`}>Word</label>
                    <input id={`${item.id}-word`} onChange={(event) => handleFieldChange(item.id, 'word', event.target.value)} value={item.word} />
                  </div>
                  <div className="form-field">
                    <label htmlFor={`${item.id}-phonetic`}>Phonetic</label>
                    <input id={`${item.id}-phonetic`} onChange={(event) => handleFieldChange(item.id, 'phonetic', event.target.value)} value={item.phonetic || ''} />
                  </div>
                  <div className="form-field">
                    <label htmlFor={`${item.id}-part-of-speech`}>Part of Speech</label>
                    <input id={`${item.id}-part-of-speech`} onChange={(event) => handleFieldChange(item.id, 'part_of_speech', event.target.value)} value={item.part_of_speech || ''} />
                  </div>
                  <div className="form-field context-field-wide">
                    <label htmlFor={`${item.id}-meaning-vi`}>Vietnamese Meaning</label>
                    <textarea id={`${item.id}-meaning-vi`} onChange={(event) => handleFieldChange(item.id, 'meaning_vi', event.target.value)} rows="2" value={item.meaning_vi || ''} />
                  </div>
                  <div className="form-field context-field-wide">
                    <label htmlFor={`${item.id}-meaning-en`}>English Meaning</label>
                    <textarea id={`${item.id}-meaning-en`} onChange={(event) => handleFieldChange(item.id, 'meaning_en', event.target.value)} rows="3" value={item.meaning_en || ''} />
                  </div>
                  <div className="form-field context-field-wide">
                    <label htmlFor={`${item.id}-example`}>Example</label>
                    <textarea id={`${item.id}-example`} onChange={(event) => handleFieldChange(item.id, 'example', event.target.value)} rows="3" value={item.example || ''} />
                    {item.example_source && <span className="context-field-source">Source: {item.example_source}</span>}
                  </div>
                </div>

                {item.alternative_status === 'translating' && (
                  <p className="message" role="status">Refreshing the Vietnamese meaning for the selected definition…</p>
                )}
                {item.alternative_status === 'translation-unavailable' && (
                  <p className="message notice-message" role="status">Vietnamese translation is unavailable. The selected English meaning was kept.</p>
                )}

                {item.alternatives?.length > 0 && (
                  <details className="context-alternatives" open={item.ambiguous}>
                    <summary>Other meanings ({item.alternatives.length})</summary>
                    <div className="context-alternative-list">
                      {item.alternatives.map((alternative, alternativeIndex) => (
                        <div className="context-alternative" key={`${item.id}-alternative-${alternativeIndex}`}>
                          <div>
                            <strong>{alternative.part_of_speech || 'Meaning'}</strong>
                            <p>{alternative.meaning_en}</p>
                            {alternative.example && <small>Example: {alternative.example}</small>}
                            <small>Source: {alternative.source || 'dictionary'}</small>
                          </div>
                          <button className="subtle-button" onClick={() => handleAlternative(item, alternative)} type="button">Use this meaning</button>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                <div className="context-card-footer">
                  <span>Dictionary source: {item.source || 'Unavailable'}</span>
                  <button
                    className="primary-button"
                    disabled={item.existing || ['saving', 'saved', 'skipped'].includes(item.save_status)}
                    onClick={() => handleSave(item)}
                    type="button"
                  >
                    {item.existing || item.save_status === 'skipped'
                      ? 'Already in vocabulary'
                      : item.save_status === 'saving' ? 'Saving…' : item.save_status === 'saved' ? 'Saved' : 'Save Vocabulary'}
                  </button>
                </div>
                {item.save_status === 'failed' && <p className="message error-message" role="alert">Could not save: {item.save_error}</p>}
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

export default PreparedVocabularyCards
