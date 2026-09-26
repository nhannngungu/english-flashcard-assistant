import assert from 'node:assert/strict'
import test from 'node:test'
import { parseDashboardTimeWindow, percentage } from './dashboardStatistics.js'

test('dashboard time window accepts exact local-day UTC boundaries', () => {
  const activity = Array.from({ length: 8 }, (_, index) =>
    new Date(Date.UTC(2026, 8, 21 + index, 17)).toISOString(),
  )
  const upcoming = [activity[6], activity[7], new Date(Date.UTC(2026, 8, 29, 17)).toISOString(), new Date(Date.UTC(2026, 9, 6, 17)).toISOString()]
  const result = parseDashboardTimeWindow({
    day_starts_utc: JSON.stringify(activity),
    upcoming_starts_utc: JSON.stringify(upcoming),
    timezone_offset_minutes: '-420',
  })

  assert.equal(result.todayStart, activity[6])
  assert.equal(result.tomorrowStart, activity[7])
  assert.equal(result.timezoneOffset, -420)
})

test('dashboard time window rejects malformed or inconsistent boundaries', () => {
  assert.equal(parseDashboardTimeWindow({}), null)
  assert.equal(parseDashboardTimeWindow({
    day_starts_utc: JSON.stringify(['invalid']),
    upcoming_starts_utc: JSON.stringify([]),
    timezone_offset_minutes: '0',
  }), null)
})

test('rating percentages are stable for empty and populated history', () => {
  assert.equal(percentage(0, 0), 0)
  assert.equal(percentage(1, 3), 33.3)
  assert.equal(percentage(3, 4), 75)
})
