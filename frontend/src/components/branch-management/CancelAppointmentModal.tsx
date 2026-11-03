import { useState, type FormEvent } from 'react'
import type { ManagementAppointment } from '../../api/management'
import styles from './CancelAppointmentModal.module.css'

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
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <form
        className={styles.modal}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-appointment-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) onClose()
        }}
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
        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose} disabled={busy}>
            Quay lại
          </button>
          <button disabled={!reason.trim() || busy}>Xác nhận hủy</button>
        </div>
      </form>
    </div>
  )
}
