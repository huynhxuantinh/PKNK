import { useState } from 'react'

import type { ManagementAppointment } from '../../api/management'
import { AdminButton, AdminForm, AdminModal, DatePicker, FormField, FormRow } from '../admin/ui'
import type { BranchDentist, Slot } from '../../types/api'
import { hcmDate, hcmTime } from './appointmentPresentation'
import './reschedule-appointment-modal.css'

interface Props { appointment: ManagementAppointment; dentists: BranchDentist[]; busy: boolean; onClose: () => void; onFindSlots: (date: string, dentistId: number) => Promise<Slot[]>; onConfirm: (slot: Slot, reason: string, dentistId: number, idempotencyKey: string) => Promise<void> }

export function RescheduleSlotResults({ slots, busy, reason, onSelect }: { slots: Slot[]; busy: boolean; reason: string; onSelect: (slot: Slot) => void }) {
  if (!slots.length) return <p role="status">Không có giờ trống phù hợp trong ngày đã chọn.</p>
  return <div>{slots.map((slot) => <button type="button" key={slot.starts_at} disabled={!reason.trim() || busy} onClick={() => onSelect(slot)}>{hcmTime(slot.starts_at)}</button>)}</div>
}

export function RescheduleAppointmentModal({ appointment, dentists, busy, onClose, onFindSlots, onConfirm }: Props) {
  const [date, setDate] = useState(() => hcmDate(new Date(appointment.starts_at)))
  const [dentistId, setDentistId] = useState(appointment.dentist_id)
  const [reason, setReason] = useState('')
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [error, setError] = useState('')
  const [idempotencyKey] = useState(() => `management-${crypto.randomUUID()}`)

  async function findSlots() {
    setError('')
    setLoadingSlots(true)
    try { setSlots(await onFindSlots(date, dentistId)) } catch (caught) { setSlots(null); setError(caught instanceof Error ? caught.message : 'Không thể tìm giờ trống.') } finally { setLoadingSlots(false) }
  }

  return <AdminModal open title="Dời lịch hẹn" description={`${appointment.patient_name} · ${appointment.service_name_snapshot}`} onClose={busy ? () => undefined : onClose}><AdminForm onSubmit={(event) => { event.preventDefault(); void findSlots() }}><FormRow><FormField label="Ngày mới"><DatePicker min={hcmDate(new Date())} value={date} onChange={(event) => { setDate(event.target.value); setSlots(null) }} /></FormField><FormField label="Nha sĩ"><select value={dentistId} onChange={(event) => { setDentistId(Number(event.target.value)); setSlots(null) }}>{dentists.map((dentist) => <option key={dentist.id_dentist} value={dentist.id_dentist}>{dentist.full_name}</option>)}</select></FormField></FormRow><FormField label="Lý do dời lịch" hint="Lý do sẽ được lưu trong lịch sử lịch hẹn."><textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ví dụ: Bệnh nhân có việc đột xuất" /></FormField><div className="reschedule-modal__controls"><AdminButton type="submit" disabled={loadingSlots || busy}>{loadingSlots ? 'Đang tìm giờ...' : 'Tìm giờ trống'}</AdminButton><AdminButton type="button" tone="secondary" disabled={busy} onClick={onClose}>Đóng</AdminButton></div></AdminForm>{error && <p className="reschedule-modal__error" role="alert">{error}</p>}{slots !== null && <section className="reschedule-modal__slots" aria-live="polite"><header><strong>Khung giờ phù hợp</strong><span>{slots.length ? 'Chọn một giờ để xác nhận dời lịch.' : 'Không có giờ trống trong ngày đã chọn.'}</span></header>{slots.length > 0 && <div>{slots.map((slot) => <button type="button" key={slot.starts_at} disabled={!reason.trim() || busy} onClick={() => void onConfirm(slot, reason.trim(), dentistId, idempotencyKey)}>{hcmTime(slot.starts_at)}</button>)}</div>}</section>}</AdminModal>
}
