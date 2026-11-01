import { useMemo, useState } from 'react'

import type { ManagementAppointment } from '../../api/management'
import type { BranchDentist } from '../../types/api'
import { appointmentStatusLabels, hcmDate, hcmTime } from './appointmentPresentation'
import './appointment-calendar.css'

type AppointmentAction = 'confirm' | 'check-in' | 'no-show'

type Props = {
  items: ManagementAppointment[] | null
  dentists: BranchDentist[]
  days: 1 | 7
  busyCode: string
  onAction: (item: ManagementAppointment, action: AppointmentAction) => void
  onCancel: (item: ManagementAppointment) => void
  onReschedule: (item: ManagementAppointment) => void
}

const START_HOUR = 8
const END_HOUR = 19
const PIXELS_PER_HOUR = 68
const dayTitle = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short', day: '2-digit', month: '2-digit' })

function localMinutes(startsAt: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(startsAt))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return Number(values.hour) * 60 + Number(values.minute)
}

function tone(status: ManagementAppointment['status']) {
  if (status === 'PENDING' || status === 'HELD') return 'warning'
  if (status === 'CHECKED_IN' || status === 'IN_PROGRESS') return 'success'
  if (status === 'CANCELLED' || status === 'NO_SHOW' || status === 'EXPIRED') return 'danger'
  return 'info'
}

export function AppointmentCalendar({ items, dentists, days, busyCode, onAction, onCancel, onReschedule }: Props) {
  const [selected, setSelected] = useState<ManagementAppointment | null>(null)
  const columns = useMemo(() => {
    if (!items) return []
    const dateKeys = [...new Set(items.map((item) => hcmDate(new Date(item.starts_at))))]
    const effectiveDentists = dentists.length ? dentists : items.map((item) => ({ id_dentist: item.dentist_id, full_name: item.dentist_name }))
    const uniqueDentists = [...new Map(effectiveDentists.map((dentist) => [dentist.id_dentist, dentist])).values()]
    const dates = dateKeys.length ? dateKeys : [hcmDate(new Date())]
    return dates.flatMap((date) => uniqueDentists.map((dentist) => ({ date, dentist })))
  }, [dentists, items])

  if (!items) return <div className="dentist-empty">Đang tải lịch hẹn...</div>
  if (!items.length) return <div className="dentist-empty">Không có lịch hẹn theo bộ lọc.</div>

  const hourLabels = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => `${String(START_HOUR + index).padStart(2, '0')}:00`)
  const calendarHeight = (END_HOUR - START_HOUR) * PIXELS_PER_HOUR

  return (
    <div className="appointment-calendar">
      <div className="appointment-calendar__legend" aria-label="Trạng thái lịch hẹn">
        <span className="is-pending">Chờ xác nhận</span><span className="is-confirmed">Đã xác nhận</span><span className="is-checked-in">Đã check-in / đang khám</span><span className="is-cancelled">Đã hủy / không đến</span>
      </div>
      <div className="appointment-calendar__scroll">
        <div className="appointment-calendar__grid" style={{ '--calendar-height': `${calendarHeight}px`, '--calendar-columns': String(Math.max(columns.length, 1)) } as React.CSSProperties}>
          <div className="appointment-calendar__time-header">Giờ</div>
          <div className="appointment-calendar__column-headers">{columns.map(({ date, dentist }) => <div key={`${date}-${dentist.id_dentist}`}><span>{days === 7 ? dayTitle.format(new Date(`${date}T00:00:00+07:00`)) : 'Hôm nay'}</span><strong>{dentist.full_name}</strong></div>)}</div>
          <div className="appointment-calendar__time-rail">{hourLabels.map((hour) => <span key={hour}>{hour}</span>)}</div>
          <div className="appointment-calendar__columns">{columns.map(({ date, dentist }) => <div className="appointment-calendar__column" key={`${date}-${dentist.id_dentist}`}>{items.filter((item) => item.dentist_id === dentist.id_dentist && hcmDate(new Date(item.starts_at)) === date).map((item) => {
            const top = Math.max(0, (localMinutes(item.starts_at) - START_HOUR * 60) / 60 * PIXELS_PER_HOUR)
            const duration = Math.max(30, (new Date(item.ends_at).getTime() - new Date(item.starts_at).getTime()) / 60000)
            return <button key={item.public_code} type="button" className={`appointment-calendar__event is-${tone(item.status)} ${selected?.public_code === item.public_code ? 'is-selected' : ''}`} style={{ top, height: Math.max(33, duration / 60 * PIXELS_PER_HOUR) }} onClick={() => setSelected(item)}><b>{hcmTime(item.starts_at)}</b><strong>{item.patient_name}</strong><span>{item.service_name_snapshot}</span></button>
          })}</div>)}</div>
        </div>
      </div>
      {selected && <aside className="appointment-calendar__detail" aria-live="polite"><div><p className="eyebrow">Thông tin nhanh</p><h3>{selected.patient_name}</h3><p>{selected.service_name_snapshot} · {selected.dentist_name}</p><small>{hcmTime(selected.starts_at)} · {selected.contact_phone_snapshot || selected.patient_phone || 'Chưa có số liên hệ'}</small>{selected.patient_note && <em>Ghi chú: {selected.patient_note}</em>}</div><div className="appointment-calendar__detail-actions"><span className={`admin-status is-${tone(selected.status)}`}>{appointmentStatusLabels[selected.status]}</span>{selected.status === 'PENDING' && <button disabled={busyCode === selected.public_code} onClick={() => onAction(selected, 'confirm')}>Xác nhận</button>}{selected.status === 'CONFIRMED' && <button disabled={busyCode === selected.public_code} onClick={() => onAction(selected, 'check-in')}>Check-in</button>}{['PENDING', 'CONFIRMED'].includes(selected.status) && <button className="button-quiet" onClick={() => onReschedule(selected)}>Đổi lịch</button>}{['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(selected.status) && <button className="button-secondary" onClick={() => onCancel(selected)}>Hủy lịch</button>}</div></aside>}
    </div>
  )
}
