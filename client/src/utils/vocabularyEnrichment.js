export const vocabularyEnrichmentFields = [
  'phonetic',
  'part_of_speech',
  'meaning_en',
  'meaning_vi',
  'example',
  'audio_url',
]

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function mergeVocabularyEnrichment(current, enrichment, dirtyFields = current.dirtyFields || []) {
  const dirty = new Set(dirtyFields)
  const updates = {}
  const filledFields = []

  for (const field of vocabularyEnrichmentFields) {
    const returnedValue = cleanText(enrichment?.[field])
    if (!dirty.has(field) && !cleanText(current?.[field]) && returnedValue) {
      updates[field] = returnedValue
      filledFields.push(field)
    }
  }

  const item = { ...current, ...updates }
  const unavailableFields = Array.isArray(enrichment?.unavailable_fields)
    ? [...new Set(enrichment.unavailable_fields.filter((field) => vocabularyEnrichmentFields.includes(field)))]
    : []
  const missingFields = vocabularyEnrichmentFields.filter((field) => !cleanText(item[field]))

  return {
    filledFields,
    item,
    missingFields,
    translationUnavailable: missingFields.includes('meaning_vi') && (
      unavailableFields.includes('meaning_vi') || Boolean(cleanText(item.meaning_en))
    ),
    unavailableFields,
  }
}

export function needsVocabularyEnrichment(item) {
  if (item.lookupStatus !== 'success') return true

  const dirty = new Set(item.dirtyFields || [])
  const unavailable = new Set(item.unavailableFields || [])
  return vocabularyEnrichmentFields.some((field) => {
    if (dirty.has(field) || cleanText(item[field])) return false
    return field === 'meaning_vi' || !unavailable.has(field)
  })
}
