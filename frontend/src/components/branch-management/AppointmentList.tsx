import { useMemo, useState } from 'react'

import type { ManagementAppointment } from '../../api/management'
import { DataTable, EmptyState, StatusBadge } from '../admin/ui'
import { appointmentStatusLabels, hcmDate, hcmTime } from './appointmentPresentation'
import './appointment-list.css'

type AppointmentAction = 'confirm' | 'check-in' | 'no-show'

interface AppointmentListProps { items: ManagementAppointment[] | null; busyCode: string; onAction: (item: ManagementAppointment, action: AppointmentAction) => void; onCancel: (item: ManagementAppointment) => void; onReschedule: (item: ManagementAppointment) => void }

function statusTone(status: ManagementAppointment['status']) {
  if (status === 'PENDING' || status === 'HELD') return 'warning' as const
  if (status === 'CHECKED_IN' || status === 'IN_PROGRESS' || status === 'COMPLETED') return 'success' as const
  if (status === 'CANCELLED' || status === 'NO_SHOW' || status === 'EXPIRED') return 'danger' as const
  return 'info' as const
}

export function ManagementErrorBanner({ message }: { message: string }) { return <div className="dentist-error" role="alert">{message}</div> }

export function AppointmentList({ items, busyCode, onAction, onCancel, onReschedule }: AppointmentListProps) {
  const [query, setQuery] = useState('')
  const rows = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('vi-VN')
    if (!keyword || !items) return items || []
    return items.filter((item) => [item.patient_name, item.service_name_snapshot, item.dentist_name, item.contact_phone_snapshot, item.patient_phone, item.public_code].filter(Boolean).some((value) => String(value).toLocaleLowerCase('vi-VN').includes(keyword)))
  }, [items, query])

  if (!items) return <div className="dentist-empty">Đang tải lịch hẹn...</div>

  return <div className="appointment-list"><div className="appointment-list__toolbar"><label><span>Tìm nhanh</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tên bệnh nhân, dịch vụ, mã lịch..." /></label><small>{rows.length} lịch phù hợp</small></div><DataTable rows={rows} rowKey={(item) => item.public_code} empty={<EmptyState title="Không có lịch hẹn" description="Thử thay đổi bộ lọc hoặc ngày xem." />} columns={[
    { key: 'time', header: 'Thời gian', cell: (item) => <div className="appointment-list__time"><strong>{hcmTime(item.starts_at)}</strong><span>{hcmDate(new Date(item.starts_at))}</span></div> },
    { key: 'patient', header: 'Bệnh nhân', cell: (item) => <div className="appointment-list__patient"><strong>{item.patient_name}</strong><small>{item.patient_phone || 'Chưa có số điện thoại'}</small>{item.contact_name_snapshot && item.contact_name_snapshot !== item.patient_name && <em>Liên hệ: {item.contact_name_snapshot}</em>}</div> },
    { key: 'service', header: 'Dịch vụ', cell: (item) => <div className="appointment-list__service"><strong>{item.service_name_snapshot}</strong><small>{item.dentist_name}</small></div> },
    { key: 'status', header: 'Trạng thái', cell: (item) => <StatusBadge tone={statusTone(item.status)}>{appointmentStatusLabels[item.status]}</StatusBadge> },
    { key: 'actions', header: 'Thao tác', className: 'appointment-list__actions-cell', cell: (item) => { const busy = busyCode === item.public_code; return <div className="appointment-list__actions">{item.status === 'PENDING' && <button disabled={busy} onClick={() => onAction(item, 'confirm')}>Xác nhận</button>}{item.status === 'CONFIRMED' && <button disabled={busy} onClick={() => onAction(item, 'check-in')}>Check-in</button>}{['PENDING', 'CONFIRMED'].includes(item.status) && <button className="is-quiet" onClick={() => onReschedule(item)}>Dời lịch</button>}{['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(item.status) && <button className="is-danger" onClick={() => onCancel(item)}>Hủy</button>}{item.status === 'CONFIRMED' && <button className="is-quiet" disabled={busy} onClick={() => onAction(item, 'no-show')}>Không đến</button>}</div> } },
  ]} /></div>
}
