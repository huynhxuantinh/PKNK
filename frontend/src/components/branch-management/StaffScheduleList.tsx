import type { ManagedTimeOff, ManagedWorkShift } from '../../api/management'
import { weekdayLabels } from './staffSchedulePresentation'

export interface ScheduleDentist {
  id_dentist: number
  full_name: string
}

const hcmDateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short',
})

function dentistName(dentists: ScheduleDentist[], dentistId: number) {
  return dentists.find((dentist) => dentist.id_dentist === dentistId)?.full_name ?? `Nha sĩ #${dentistId}`
}

function ScheduleStatus({ active }: { active: boolean }) {
  return <span className={`staff-schedule-status ${active ? 'is-active' : 'is-inactive'}`}>{active ? 'Đang áp dụng' : 'Đã ngừng'}</span>
}

interface WorkShiftListProps {
  dentists: ScheduleDentist[]
  items: ManagedWorkShift[]
  busyId: number | null
  onEdit: (item: ManagedWorkShift) => void
  onToggle: (item: ManagedWorkShift) => void
}

export function StaffWorkShiftList({ dentists, items, busyId, onEdit, onToggle }: WorkShiftListProps) {
  if (!items.length) return <div className="staff-schedule-empty">Chưa có ca làm việc.</div>
  return <div className="staff-schedule-list">{items.map((item) => (
    <article className="staff-schedule-card" key={item.id_work_shift}>
      <div className="staff-schedule-date"><strong>{weekdayLabels[item.weekday - 1]}</strong><span>{item.start_time.slice(0, 5)} – {item.end_time.slice(0, 5)}</span></div>
      <div className="staff-schedule-detail"><ScheduleStatus active={item.is_active} /><h3>{dentistName(dentists, item.dentist_id)}</h3><p>Áp dụng từ {item.valid_from}{item.valid_to ? ` đến ${item.valid_to}` : ''}</p></div>
      <div className="branch-management-actions">
        <button type="button" className="button-secondary" onClick={() => onEdit(item)}>Chỉnh sửa</button>
        <button type="button" className="button-quiet" disabled={busyId === item.id_work_shift} onClick={() => onToggle(item)}>{item.is_active ? 'Ngừng áp dụng' : 'Kích hoạt lại'}</button>
      </div>
    </article>
  ))}</div>
}

interface TimeOffListProps {
  dentists: ScheduleDentist[]
  items: ManagedTimeOff[]
  busyId: number | null
  onEdit: (item: ManagedTimeOff) => void
  onToggle: (item: ManagedTimeOff) => void
}

export function StaffTimeOffList({ dentists, items, busyId, onEdit, onToggle }: TimeOffListProps) {
  if (!items.length) return <div className="staff-schedule-empty">Chưa có lịch nghỉ.</div>
  return <div className="staff-schedule-list">{items.map((item) => (
    <article className="staff-schedule-card" key={item.id_time_off}>
      <div className="staff-schedule-date"><strong>{hcmDateTimeFormatter.format(new Date(item.starts_at))}</strong><span>đến {hcmDateTimeFormatter.format(new Date(item.ends_at))}</span></div>
      <div className="staff-schedule-detail"><ScheduleStatus active={item.is_active} /><h3>{dentistName(dentists, item.dentist_id)}</h3><p>{item.reason}</p></div>
      <div className="branch-management-actions">
        <button type="button" className="button-secondary" onClick={() => onEdit(item)}>Chỉnh sửa</button>
        <button type="button" className="button-quiet" disabled={busyId === item.id_time_off} onClick={() => onToggle(item)}>{item.is_active ? 'Xóa lịch nghỉ' : 'Khôi phục'}</button>
      </div>
    </article>
  ))}</div>
}
