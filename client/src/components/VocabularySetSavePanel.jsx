import { useId, useMemo, useState } from 'react'
import { createVocabulary, getVocabularies } from '../api/vocabularies.js'
import { createVocabularySet } from '../api/vocabularySets.js'
import VocabularySetFields from './VocabularySetFields.jsx'

function vocabularyKey(value) {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US')
    : ''
}

function VocabularySetSavePanel({
  items,
  onVocabularyCreated = () => {},
  heading = 'Save as a vocabulary set',
  idPrefix = 'prepared-set',
  allowSelection = false,
}) {
  const uniqueId = useId().replace(/:/g, '')
  const fieldIdPrefix = `${idPrefix}-${uniqueId}`
  const [title, setTitle] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const eligibleItems = useMemo(
    () => items.filter((item) => vocabularyKey(item.word) && item.status !== 'failed'),
    [items],
  )
  const [selectedKeys, setSelectedKeys] = useState(() => new Set(
    items.filter((item) => vocabularyKey(item.word) && item.status !== 'failed').map((item) => item.id),
  ))
  const savableItems = allowSelection
    ? eligibleItems.filter((item) => selectedKeys.has(item.id))
    : eligibleItems
  const candidateImages = savableItems.map((item) => item.image_url)

  async function handleSaveSet() {
    if (!savableItems.length || isSaving) return
    setIsSaving(true)
    setMessage('')
    setError('')

    try {
      const existing = await getVocabularies()
      const existingKeys = new Set(existing.map((item) => vocabularyKey(item.word)))
      const newItems = savableItems.filter((item) => !existingKeys.has(vocabularyKey(item.word)))

      if (!newItems.length) {
        setMessage('All prepared items are already in your vocabulary. No empty set was created.')
        return
      }

      const vocabularySet = await createVocabularySet({ title, cover_image_url: coverImageUrl })
      let saved = 0
      const failures = []

      for (const item of newItems) {
        try {
          await createVocabulary({
            word: item.word,
            phonetic: item.phonetic || '',
            meaning_vi: item.meaning_vi || '',
            meaning_en: item.meaning_en || '',
            part_of_speech: item.part_of_speech || '',
            example: item.example || '',
            audio_url: item.audio_url || '',
            image_url: item.image_url || '',
            set_id: vocabularySet.id,
            status: 'new',
          })
          saved += 1
        } catch (saveError) {
          failures.push(`${item.word}: ${saveError.message}`)
        }
      }

      if (saved > 0) onVocabularyCreated()
      setMessage(`${vocabularySet.title}: ${saved} saved, ${savableItems.length - newItems.length} already existed${failures.length ? `, ${failures.length} failed` : ''}.`)
      if (failures.length) setError(failures.join(' '))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSaving(false)
    }
  }

  if (!eligibleItems.length) return null

  return (
    <section className="vocabulary-set-save-panel" aria-labelledby={`${fieldIdPrefix}-heading`}>
      <div>
        <h5 id={`${fieldIdPrefix}-heading`}>{heading}</h5>
        <p>These {savableItems.length} selected {savableItems.length === 1 ? 'item' : 'items'} will share one review set.</p>
      </div>
      {allowSelection && (
        <div className="vocabulary-set-item-choices" aria-label="Choose vocabulary for this set">
          {eligibleItems.map((item) => (
            <label key={item.id}>
              <input
                checked={selectedKeys.has(item.id)}
                disabled={isSaving}
                onChange={(event) => setSelectedKeys((current) => {
                  const next = new Set(current)
                  if (event.target.checked) next.add(item.id)
                  else next.delete(item.id)
                  return next
                })}
                type="checkbox"
              />
              {item.word}
            </label>
          ))}
        </div>
      )}
      <VocabularySetFields
        candidateImages={candidateImages}
        coverImageUrl={coverImageUrl}
        disabled={isSaving}
        idPrefix={fieldIdPrefix}
        onCoverImageUrlChange={setCoverImageUrl}
        onTitleChange={setTitle}
        title={title}
      />
      <button className="primary-button" disabled={isSaving || !savableItems.length} onClick={handleSaveSet} type="button">
        {isSaving ? 'Saving Set…' : `Save Vocabulary Set (${savableItems.length})`}
      </button>
      {message && <p className="message success-message" role="status">{message}</p>}
      {error && <p className="message error-message" role="alert">{error}</p>}
    </section>
  )
}

export default VocabularySetSavePanel
