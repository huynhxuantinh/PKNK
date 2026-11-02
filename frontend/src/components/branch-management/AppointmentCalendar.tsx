import { useMemo, useState } from 'react'

import type { ManagementAppointment } from '../../api/management'
import type { BranchDentist, BranchOpeningHour } from '../../types/api'
import { appointmentStatusLabels, hcmDate, hcmTime } from './appointmentPresentation'
import './appointment-calendar.css'

type AppointmentAction = 'confirm' | 'check-in' | 'no-show'

type Props = {
  items: ManagementAppointment[] | null
  dentists: BranchDentist[]
  openingHours: BranchOpeningHour[]
  selectedDate: string
  days: 1 | 7
  busyCode: string
  onAction: (item: ManagementAppointment, action: AppointmentAction) => void
  onCancel: (item: ManagementAppointment) => void
  onReschedule: (item: ManagementAppointment) => void
}

const PIXELS_PER_HOUR = 68
const dayTitle = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short', day: '2-digit', month: '2-digit' })

function dateRange(start: string, days: number) {
  const [year, month, day] = start.split('-').map(Number)
  return Array.from({ length: days }, (_, index) => {
    const current = new Date(Date.UTC(year, month - 1, day + index))
    return `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, '0')}-${String(current.getUTCDate()).padStart(2, '0')}`
  })
}

function localMinutes(startsAt: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(startsAt))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return Number(values.hour) * 60 + Number(values.minute)
}

function minutesFromTime(value: string | null) {
  if (!value) return null
  const [hour, minute] = value.split(':').map(Number)
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null
}

function weekdayForDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7
}

function tone(status: ManagementAppointment['status']) {
  if (status === 'PENDING' || status === 'HELD') return 'warning'
  if (status === 'CHECKED_IN' || status === 'IN_PROGRESS') return 'success'
  if (status === 'CANCELLED' || status === 'NO_SHOW' || status === 'EXPIRED') return 'danger'
  return 'info'
}

export function AppointmentCalendar({ items, dentists, openingHours, selectedDate, days, busyCode, onAction, onCancel, onReschedule }: Props) {
  const [selectedCode, setSelectedCode] = useState('')
  const columns = useMemo(() => {
    if (!items) return []
    const effectiveDentists = dentists.length ? dentists : items.map((item) => ({ id_dentist: item.dentist_id, full_name: item.dentist_name }))
    const uniqueDentists = [...new Map(effectiveDentists.map((dentist) => [dentist.id_dentist, dentist])).values()]
    const dates = dateRange(selectedDate, days)
    return dates.flatMap((date) => uniqueDentists.map((dentist) => ({ date, dentist })))
  }, [days, dentists, items, selectedDate])
  const calendarHours = useMemo(() => {
    const dates = dateRange(selectedDate, days)
    const hoursForDates = dates.flatMap((date) => {
      const row = openingHours.find((item) => item.weekday === weekdayForDate(date))
      if (!row || row.is_closed) return []
      const open = minutesFromTime(row.open_time)
      const close = minutesFromTime(row.close_time)
      return open !== null && close !== null && close > open ? [open, close] : []
    })
    const appointmentMinutes = (items || []).flatMap((item) => [localMinutes(item.starts_at), localMinutes(item.ends_at)])
    const values = [...hoursForDates, ...appointmentMinutes]
    const first = values.length ? Math.min(...values) : 8 * 60
    const last = values.length ? Math.max(...values) : 19 * 60
    return { start: Math.floor(first / 60) * 60, end: Math.max((Math.ceil(last / 60) * 60), Math.floor(first / 60) * 60 + 60) }
  }, [days, items, openingHours, selectedDate])
  const selected = items?.find((item) => item.public_code === selectedCode) || null

  if (!items) return <div className="dentist-empty">Đang tải lịch hẹn...</div>
  if (!columns.length) return <div className="dentist-empty">Chi nhánh chưa có nha sĩ để hiển thị lịch.</div>

  const hourLabels = Array.from({ length: (calendarHours.end - calendarHours.start) / 60 + 1 }, (_, index) => `${String((calendarHours.start / 60) + index).padStart(2, '0')}:00`)
  const calendarHeight = ((calendarHours.end - calendarHours.start) / 60) * PIXELS_PER_HOUR

  return (
    <div className="appointment-calendar">
      <div className="appointment-calendar__legend" aria-label="Trạng thái lịch hẹn">
        <span className="is-pending">Chờ xác nhận</span><span className="is-confirmed">Đã xác nhận</span><span className="is-checked-in">Đã check-in / đang khám</span><span className="is-cancelled">Đã hủy / không đến</span>
      </div>
      <div className="appointment-calendar__scroll">
        <div className="appointment-calendar__grid" style={{ '--calendar-height': `${calendarHeight}px`, '--calendar-columns': String(Math.max(columns.length, 1)) } as React.CSSProperties}>
          <div className="appointment-calendar__time-header">Giờ</div>
          <div className="appointment-calendar__column-headers">{columns.map(({ date, dentist }) => <div key={`${date}-${dentist.id_dentist}`}><span>{dayTitle.format(new Date(`${date}T00:00:00+07:00`))}</span><strong>{dentist.full_name}</strong></div>)}</div>
          <div className="appointment-calendar__time-rail">{hourLabels.map((hour) => <span key={hour}>{hour}</span>)}</div>
          <div className="appointment-calendar__columns">{columns.map(({ date, dentist }) => <div className="appointment-calendar__column" key={`${date}-${dentist.id_dentist}`}>{items.filter((item) => item.dentist_id === dentist.id_dentist && hcmDate(new Date(item.starts_at)) === date).map((item) => {
            const top = Math.max(0, (localMinutes(item.starts_at) - calendarHours.start) / 60 * PIXELS_PER_HOUR)
            const duration = Math.max(30, (new Date(item.ends_at).getTime() - new Date(item.starts_at).getTime()) / 60000)
            return <button key={item.public_code} type="button" className={`appointment-calendar__event is-${tone(item.status)} ${selected?.public_code === item.public_code ? 'is-selected' : ''}`} style={{ top, height: Math.max(33, duration / 60 * PIXELS_PER_HOUR) }} onClick={() => setSelectedCode(item.public_code)}><b>{hcmTime(item.starts_at)}</b><strong>{item.patient_name}</strong><span>{item.service_name_snapshot}</span></button>
          })}</div>)}</div>
        </div>
      </div>
      {selected && <aside className="appointment-calendar__detail" aria-live="polite"><div><p className="eyebrow">Thông tin nhanh</p><h3>{selected.patient_name}</h3><p>{selected.service_name_snapshot} · {selected.dentist_name}</p><small>{hcmTime(selected.starts_at)} · {selected.contact_phone_snapshot || selected.patient_phone || 'Chưa có số liên hệ'}</small>{selected.patient_note && <em>Ghi chú: {selected.patient_note}</em>}</div><div className="appointment-calendar__detail-actions"><span className={`admin-status is-${tone(selected.status)}`}>{appointmentStatusLabels[selected.status]}</span>{selected.status === 'PENDING' && <button disabled={busyCode === selected.public_code} onClick={() => onAction(selected, 'confirm')}>Xác nhận</button>}{selected.status === 'CONFIRMED' && <button disabled={busyCode === selected.public_code} onClick={() => onAction(selected, 'check-in')}>Check-in</button>}{selected.status === 'CONFIRMED' && <button className="button-quiet" disabled={busyCode === selected.public_code} onClick={() => onAction(selected, 'no-show')}>Không đến</button>}{['PENDING', 'CONFIRMED'].includes(selected.status) && <button className="button-quiet" onClick={() => onReschedule(selected)}>Đổi lịch</button>}{['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(selected.status) && <button className="button-secondary" onClick={() => onCancel(selected)}>Hủy lịch</button>}</div></aside>}
    </div>
  )
}
