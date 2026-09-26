function localDayStart(offsetDays) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offsetDays)
  return date.toISOString()
}

export async function getDashboardStatistics() {
  const dayStarts = Array.from({ length: 8 }, (_, index) => localDayStart(index - 6))
  const upcomingStarts = [
    localDayStart(0),
    localDayStart(1),
    localDayStart(2),
    localDayStart(9),
  ]
  const query = new URLSearchParams({
    day_starts_utc: JSON.stringify(dayStarts),
    upcoming_starts_utc: JSON.stringify(upcomingStarts),
    timezone_offset_minutes: String(new Date().getTimezoneOffset()),
  })

  let response
  try {
    response = await fetch(`/api/statistics/dashboard?${query}`)
  } catch {
    throw new Error('Unable to reach the server. Check that the backend is running.')
  }

  let data
  try {
    data = await response.json()
  } catch {
    throw new Error(`The server returned an unexpected response (${response.status}).`)
  }

  if (!response.ok) throw new Error(data.error || 'Could not load learning statistics.')
  return data
}
