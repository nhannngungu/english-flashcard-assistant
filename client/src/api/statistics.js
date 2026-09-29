import { apiRequest } from './client.js'

function localDayStart(offsetDays) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offsetDays)
  return date.toISOString()
}

export function getDashboardStatistics() {
  const query = new URLSearchParams({
    day_starts_utc: JSON.stringify(Array.from({ length: 8 }, (_, index) => localDayStart(index - 6))),
    upcoming_starts_utc: JSON.stringify([localDayStart(0), localDayStart(1), localDayStart(2), localDayStart(9)]),
    timezone_offset_minutes: String(new Date().getTimezoneOffset()),
  })
  return apiRequest(`statistics/dashboard?${query}`)
}
