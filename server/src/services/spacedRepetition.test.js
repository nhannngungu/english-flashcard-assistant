import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateReviewSchedule, toSqliteUtc } from './spacedRepetition.js'

const now = new Date('2026-09-26T12:00:00.000Z')

test('new-card ratings produce progressively longer schedules', () => {
  const again = calculateReviewSchedule({ rating: 'again', now })
  const hard = calculateReviewSchedule({ rating: 'hard', now })
  const good = calculateReviewSchedule({ rating: 'good', now })
  const easy = calculateReviewSchedule({ rating: 'easy', now })

  assert.equal(again.nextReviewAt.toISOString(), '2026-09-26T12:10:00.000Z')
  assert.equal(hard.intervalDays, 1)
  assert.equal(good.intervalDays, 1)
  assert.equal(easy.intervalDays, 4)
})

test('later reviews use the previous interval and ease factor', () => {
  const schedule = calculateReviewSchedule({
    rating: 'good',
    previousIntervalDays: 4,
    previousEaseFactor: 2.5,
    reviewCount: 3,
    now,
  })

  assert.equal(schedule.intervalDays, 10)
  assert.equal(toSqliteUtc(schedule.nextReviewAt), '2026-10-06 12:00:00')
})
