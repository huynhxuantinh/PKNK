import { useEffect, useState } from 'react'

import type { ManagementAppointment, ManagementAppointmentStatus } from '../../api/management'

const CHECK_IN_EARLY_MINUTES = 120
const DEFAULT_NO_SHOW_GRACE_MINUTES = 15

export const appointmentStatusLabels: Record<ManagementAppointmentStatus, string> = {
  HELD: 'Đang giữ chỗ',
  EXPIRED: 'Đã hết hạn giữ chỗ',
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  CHECKED_IN: 'Đã đến khám',
  IN_PROGRESS: 'Đang khám',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
  NO_SHOW: 'Không đến',
}

export function hcmDate(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
}

export function hcmTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function useManagementClock() {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(intervalId)
  }, [])

  return now
}

export function appointmentActionWindow(
  appointment: ManagementAppointment,
  now = Date.now(),
) {
  const startsAt = new Date(appointment.starts_at).getTime()
  const checkInOpensAt = new Date(
    appointment.check_in_opens_at
      ?? startsAt - CHECK_IN_EARLY_MINUTES * 60_000,
  ).getTime()
  const noShowOpensAt = new Date(
    appointment.no_show_opens_at
      ?? startsAt + DEFAULT_NO_SHOW_GRACE_MINUTES * 60_000,
  ).getTime()

  return {
    canCheckIn: now >= checkInOpensAt && now <= noShowOpensAt,
    canMarkNoShow: now >= noShowOpensAt,
    checkInOpensAt: new Date(checkInOpensAt).toISOString(),
    noShowOpensAt: new Date(noShowOpensAt).toISOString(),
  }
}

export function appointmentActionHint(
  appointment: ManagementAppointment,
  now = Date.now(),
) {
  const window = appointmentActionWindow(appointment, now)
  if (!window.canCheckIn && now < new Date(window.checkInOpensAt).getTime()) {
    return `Có thể check-in từ ${hcmTime(window.checkInOpensAt)}.`
  }
  if (!window.canMarkNoShow) {
    return `Có thể đánh dấu không đến từ ${hcmTime(window.noShowOpensAt)}.`
  }
  return null
}
