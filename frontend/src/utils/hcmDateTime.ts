export const HCM_TIME_ZONE = 'Asia/Ho_Chi_Minh'

export function hcmDate(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: HCM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
}

function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function hcmDateRange(startDate: string, days = 1) {
  const endDate = addCalendarDays(startDate, days)
  return {
    start: new Date(`${startDate}T00:00:00+07:00`),
    end: new Date(`${endDate}T00:00:00+07:00`),
  }
}

export function upcomingHcmRange(now = new Date(), days = 7) {
  return hcmDateRange(hcmDate(now), days)
}

export function isOnHcmDay(value: string, offset: number, now = new Date()) {
  return hcmDate(new Date(value)) === addCalendarDays(hcmDate(now), offset)
}

export function formatHcmTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: HCM_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function formatHcmDay(value: string, now = new Date()) {
  if (isOnHcmDay(value, 0, now)) return 'Hôm nay'
  if (isOnHcmDay(value, 1, now)) return 'Ngày mai'
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: HCM_TIME_ZONE,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value))
}
