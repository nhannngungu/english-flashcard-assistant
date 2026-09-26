const minute = 60 * 1000
const day = 24 * 60 * minute

export const reviewRatings = new Set(['again', 'hard', 'good', 'easy'])

function roundedDays(value) {
  return Math.max(1, Math.round(value))
}

export function calculateReviewSchedule({
  rating,
  previousIntervalDays = 0,
  previousEaseFactor = 2.5,
  reviewCount = 0,
  now = new Date(),
}) {
  if (!reviewRatings.has(rating)) throw new Error('Unsupported review rating.')

  let intervalDays = previousIntervalDays
  let easeFactor = previousEaseFactor
  let delay = day

  if (rating === 'again') {
    intervalDays = 0
    easeFactor = Math.max(1.3, easeFactor - 0.2)
    delay = 10 * minute
  } else if (rating === 'hard') {
    intervalDays = reviewCount === 0 ? 1 : roundedDays(Math.max(1, previousIntervalDays) * 1.2)
    easeFactor = Math.max(1.3, easeFactor - 0.15)
    delay = intervalDays * day
  } else if (rating === 'good') {
    intervalDays = reviewCount === 0
      ? 1
      : reviewCount === 1 ? 3 : roundedDays(Math.max(1, previousIntervalDays) * easeFactor)
    delay = intervalDays * day
  } else {
    intervalDays = reviewCount === 0
      ? 4
      : roundedDays(Math.max(1, previousIntervalDays) * easeFactor * 1.3)
    easeFactor = Math.min(3, easeFactor + 0.15)
    delay = intervalDays * day
  }

  return {
    intervalDays,
    easeFactor: Number(easeFactor.toFixed(2)),
    nextReviewAt: new Date(now.getTime() + delay),
  }
}

export function toSqliteUtc(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}
