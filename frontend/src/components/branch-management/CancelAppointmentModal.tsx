import { useState, type FormEvent } from 'react'
import type { ManagementAppointment } from '../../api/management'

interface CancelAppointmentModalProps {
  appointment: ManagementAppointment
  busy: boolean
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}

export function CancelAppointmentModal({
  appointment,
  busy,
  onClose,
  onConfirm,
}: CancelAppointmentModalProps) {
  const [reason, setReason] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    const normalizedReason = reason.trim()
    if (!normalizedReason || busy) return
    await onConfirm(normalizedReason)
  }

  return (
    <div className="branch-management-modal-backdrop">
      <form
        className="branch-management-modal"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-appointment-title"
      >
        <h2 id="cancel-appointment-title">Hủy lịch hẹn</h2>
        <p>{appointment.patient_name} · {appointment.service_name_snapshot}</p>
        <label>
          Lý do hủy
          <textarea
            autoFocus
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <div>
          <button type="button" className="button-secondary" onClick={onClose} disabled={busy}>
            Quay lại
          </button>
          <button disabled={!reason.trim() || busy}>Xác nhận hủy</button>
        </div>
      </form>
    </div>
  )
}
