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

  useEffect(() => {
    dialogRef.current?.focus()
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
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) onCancel()
        }}
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
