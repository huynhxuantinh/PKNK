import { useEffect, useRef, useState, type FormEvent } from 'react'
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
  const modalRef = useRef<HTMLFormElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const busyRef = useRef(busy)

  onCloseRef.current = onClose
  busyRef.current = busy

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return
    const modal = modalRef.current
    if (!modal) return
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const selector = 'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusable = () => Array.from(modal.querySelectorAll<HTMLElement>(selector))
    const frame = window.requestAnimationFrame(() => focusable()[0]?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      restoreFocusRef.current?.focus()
    }
  }, [])

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
        ref={modalRef}
        className={styles.modal}
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
