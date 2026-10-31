import { useState } from 'react'
import type { ManagementAppointment } from '../../api/management'
import type { BranchDentist, Slot } from '../../types/api'
import { hcmDate, hcmTime } from './appointmentPresentation'

interface RescheduleAppointmentModalProps {
  appointment: ManagementAppointment
  dentists: BranchDentist[]
  busy: boolean
  onClose: () => void
  onFindSlots: (date: string, dentistId: number) => Promise<Slot[]>
  onConfirm: (
    slot: Slot,
    reason: string,
    dentistId: number,
    idempotencyKey: string,
  ) => Promise<void>
}

interface RescheduleSlotResultsProps {
  slots: Slot[]
  busy: boolean
  reason: string
  onSelect: (slot: Slot) => void
}

export function RescheduleSlotResults({
  slots,
  busy,
  reason,
  onSelect,
}: RescheduleSlotResultsProps) {
  if (slots.length === 0) {
    return <p role="status">Không có giờ trống phù hợp trong ngày đã chọn.</p>
  }

  return (
    <div className="reschedule-slots">
      {slots.map((slot) => (
        <button
          type="button"
          key={slot.starts_at}
          disabled={!reason.trim() || busy}
          onClick={() => onSelect(slot)}
        >
          {hcmTime(slot.starts_at)}
        </button>
      ))}
    </div>
  )
}

export function RescheduleAppointmentModal({
  appointment,
  dentists,
  busy,
  onClose,
  onFindSlots,
  onConfirm,
}: RescheduleAppointmentModalProps) {
  const [date, setDate] = useState(() => hcmDate(new Date(appointment.starts_at)))
  const [dentistId, setDentistId] = useState<number>(appointment.dentist_id)
  const [reason, setReason] = useState('')
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [idempotencyKey] = useState(() => `management-${crypto.randomUUID()}`)

  async function findSlots() {
    setLoadingSlots(true)
    try {
      setSlots(await onFindSlots(date, dentistId))
    } finally {
      setLoadingSlots(false)
    }
  }

  return (
    <div className="branch-management-modal-backdrop">
      <div
        className="branch-management-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reschedule-appointment-title"
      >
        <h2 id="reschedule-appointment-title">Đổi lịch hẹn</h2>
        <p>{appointment.patient_name} · {appointment.service_name_snapshot}</p>
        <label>
          Ngày
          <input
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value)
              setSlots(null)
            }}
          />
        </label>
        <label>
          Nha sĩ
          <select
            value={dentistId || ''}
            onChange={(event) => {
              setDentistId(Number(event.target.value))
              setSlots(null)
            }}
          >
            {dentists.map((dentist) => (
              <option key={dentist.id_dentist} value={dentist.id_dentist}>
                {dentist.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Lý do
          <textarea required value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <button type="button" onClick={findSlots} disabled={loadingSlots || busy}>
          {loadingSlots ? 'Đang tìm...' : 'Tìm giờ trống'}
        </button>
        {slots && (
          <RescheduleSlotResults
            slots={slots}
            busy={busy}
            reason={reason}
            onSelect={(slot) => onConfirm(slot, reason.trim(), dentistId, idempotencyKey)}
          />
        )}
        <button type="button" className="button-secondary" onClick={onClose} disabled={busy}>
          Đóng
        </button>
      </div>
    </div>
  )
}
