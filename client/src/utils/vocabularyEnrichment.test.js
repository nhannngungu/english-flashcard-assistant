import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeVocabularyEnrichment, needsVocabularyEnrichment } from './vocabularyEnrichment.js'

test('full dictionary enrichment fills every missing vocabulary field', () => {
  const current = {
    lookupStatus: 'pending',
    phonetic: '', part_of_speech: '', meaning_en: '', meaning_vi: '', example: '', audio_url: '',
  }
  const enrichment = {
    phonetic: '/test/', part_of_speech: 'noun', meaning_en: 'A definition', meaning_vi: 'Một định nghĩa',
    example: 'A test example.', audio_url: 'https://audio.example/test.mp3', unavailable_fields: [],
  }
  const result = mergeVocabularyEnrichment(current, enrichment)

  assert.equal(result.item.meaning_vi, 'Một định nghĩa')
  assert.deepEqual(result.filledFields, ['phonetic', 'part_of_speech', 'meaning_en', 'meaning_vi', 'example', 'audio_url'])
  assert.equal(result.translationUnavailable, false)
})

test('enrichment keeps existing and user-edited fields while filling other gaps', () => {
  const current = {
    lookupStatus: 'success', dirtyFields: ['meaning_vi'],
    phonetic: '/custom/', part_of_speech: '', meaning_en: '', meaning_vi: '', example: '', audio_url: '',
    image_url: 'https://images.example/kept.jpg',
  }
  const result = mergeVocabularyEnrichment(current, {
    phonetic: '/provider/', part_of_speech: 'verb', meaning_en: 'To retain', meaning_vi: 'Giữ lại',
  })

  assert.equal(result.item.phonetic, '/custom/')
  assert.equal(result.item.meaning_vi, '')
  assert.equal(result.item.meaning_en, 'To retain')
  assert.equal(result.item.image_url, 'https://images.example/kept.jpg')
  assert.equal(needsVocabularyEnrichment({ ...result.item, unavailableFields: [], dirtyFields: ['meaning_vi'] }), true)
})

test('translation failure keeps English data and leaves the row retryable', () => {
  const result = mergeVocabularyEnrichment({
    lookupStatus: 'success', dirtyFields: [],
    phonetic: '', part_of_speech: '', meaning_en: '', meaning_vi: '', example: '', audio_url: '',
  }, {
    meaning_en: 'A useful advantage', meaning_vi: '', unavailable_fields: ['meaning_vi', 'example', 'audio_url'],
  })
  const item = { ...result.item, lookupStatus: 'success', unavailableFields: result.unavailableFields }

  assert.equal(item.meaning_en, 'A useful advantage')
  assert.equal(item.meaning_vi, '')
  assert.equal(result.translationUnavailable, true)
  assert.equal(needsVocabularyEnrichment(item), true)
})
