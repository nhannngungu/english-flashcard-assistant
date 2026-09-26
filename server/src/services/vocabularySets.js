export const vocabularySetPageSize = 6

export function getVocabularySetPage(value) {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

export function defaultVocabularySetTitle(date = new Date(), timezoneOffsetMinutes = 0) {
  const safeOffset = Number.isFinite(timezoneOffsetMinutes) && Math.abs(timezoneOffsetMinutes) <= 840
    ? timezoneOffsetMinutes
    : 0
  const localDate = new Date(date.getTime() - safeOffset * 60 * 1000)
  const day = String(localDate.getUTCDate()).padStart(2, '0')
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0')
  return `Vocabulary Set - ${day}/${month}/${localDate.getUTCFullYear()}`
}
