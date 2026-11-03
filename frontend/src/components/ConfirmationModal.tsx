import { useEffect, useRef } from 'react'

type Props = {
  title: string
  description: string
  confirmLabel?: string
  busy?: boolean
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmationModal({
  title,
  description,
  confirmLabel = 'Xác nhận',
  busy = false,
  danger = false,
  onCancel,
  onConfirm,
}: Props) {
  const dialogRef = useRef<HTMLElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const onCancelRef = useRef(onCancel)
  const busyRef = useRef(busy)

  onCancelRef.current = onCancel
  busyRef.current = busy

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const dialog = dialogRef.current
    const focusableSelector = [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',')
    const focusFirst = () => {
      const first = dialog?.querySelector<HTMLElement>(focusableSelector)
      ;(first ?? dialog)?.focus()
    }
    const frame = window.requestAnimationFrame(focusFirst)
    const onKeyDown = (event: KeyboardEvent) => {
      if (!dialog) return
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault()
        onCancelRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      if (!focusable.length) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
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

  return (
    <div className="confirmation-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel()
    }}>
      <section
        ref={dialogRef}
        className="confirmation-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-modal-title"
        aria-describedby="confirmation-modal-description"
        tabIndex={-1}
      >
        <h2 id="confirmation-modal-title">{title}</h2>
        <p id="confirmation-modal-description">{description}</p>
        <div>
          <button type="button" className="confirmation-modal-cancel" disabled={busy} onClick={onCancel}>
            Quay lại
          </button>
          <button
            type="button"
            className={danger ? 'confirmation-modal-danger' : ''}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Đang xử lý...' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
