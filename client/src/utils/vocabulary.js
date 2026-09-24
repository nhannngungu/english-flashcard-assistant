export function getVietnameseMeaning(vocabulary) {
  return vocabulary.meaning_vi || vocabulary.meaning || ''
}

export function getEnglishDefinition(vocabulary) {
  return vocabulary.meaning_en || ''
}
