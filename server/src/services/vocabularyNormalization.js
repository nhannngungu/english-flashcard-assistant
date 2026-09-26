const boundaryBulletPattern = /[-–—•*·]/u
const leadingBulletPattern = new RegExp(`^(?:${boundaryBulletPattern.source})+\\s*`, 'u')
const trailingBulletPattern = new RegExp(`\\s*(?:${boundaryBulletPattern.source})+$`, 'u')

function normalizeWhitespace(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

export function normalizeVocabularyPhrase(value) {
  return normalizeWhitespace(value)
}

export function normalizeOcrVocabularyWord(value) {
  let word = normalizeWhitespace(value)
  const warnings = []

  if (leadingBulletPattern.test(word)) {
    word = word.replace(leadingBulletPattern, '')
    warnings.push('Removed leading OCR bullet marker.')
  }

  if (trailingBulletPattern.test(word)) {
    word = word.replace(trailingBulletPattern, '')
    warnings.push('Removed trailing OCR bullet marker.')
  }

  return {
    value: normalizeWhitespace(word),
    warnings,
  }
}
