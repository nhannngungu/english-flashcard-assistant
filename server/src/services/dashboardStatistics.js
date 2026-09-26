const minimumDayMilliseconds = 22 * 60 * 60 * 1000
const maximumDayMilliseconds = 26 * 60 * 60 * 1000

function parseDateList(value, expectedLength) {
  let values

  try {
    values = JSON.parse(value)
  } catch {
    return null
  }

  if (!Array.isArray(values) || values.length !== expectedLength) return null

  const dates = values.map((item) => new Date(item))
  if (dates.some((date) => Number.isNaN(date.getTime()))) return null

  for (let index = 1; index < dates.length; index += 1) {
    if (dates[index] <= dates[index - 1]) return null
  }

  return dates
}

export function parseDashboardTimeWindow(query = {}) {
  const activityDates = parseDateList(query.day_starts_utc, 8)
  const upcomingDates = parseDateList(query.upcoming_starts_utc, 4)
  const timezoneOffset = Number(query.timezone_offset_minutes)

  if (!activityDates || !upcomingDates) return null
  if (!Number.isFinite(timezoneOffset) || Math.abs(timezoneOffset) > 840) return null

  for (let index = 1; index < activityDates.length; index += 1) {
    const duration = activityDates[index].getTime() - activityDates[index - 1].getTime()
    if (duration < minimumDayMilliseconds || duration > maximumDayMilliseconds) return null
  }

  if (
    activityDates[6].getTime() !== upcomingDates[0].getTime()
    || activityDates[7].getTime() !== upcomingDates[1].getTime()
  ) return null

  const tomorrowDuration = upcomingDates[2].getTime() - upcomingDates[1].getTime()
  const sevenDayDuration = upcomingDates[3].getTime() - upcomingDates[2].getTime()
  if (tomorrowDuration < minimumDayMilliseconds || tomorrowDuration > maximumDayMilliseconds) return null
  if (sevenDayDuration < 6.5 * 24 * 60 * 60 * 1000 || sevenDayDuration > 7.5 * 24 * 60 * 60 * 1000) return null

  return {
    activityStarts: activityDates.map((date) => date.toISOString()),
    todayStart: upcomingDates[0].toISOString(),
    tomorrowStart: upcomingDates[1].toISOString(),
    dayAfterTomorrowStart: upcomingDates[2].toISOString(),
    nextSevenDaysEnd: upcomingDates[3].toISOString(),
    timezoneOffset,
  }
}

export function percentage(count, total) {
  return total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0
}
