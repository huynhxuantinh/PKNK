interface AssignmentOption {
  id: number
  label: string
  hint?: string
}

interface OrganizationAssignmentModalProps {
  title: string
  description: string
  warning: string
  options: AssignmentOption[]
  selectedIds: number[]
  emptyText: string
  busy: boolean
  error: string
  onToggle: (id: number) => void
  onClose: () => void
  onSave: () => void
}

export function OrganizationAssignmentModal({
  title,
  description,
  warning,
  options,
  selectedIds,
  emptyText,
  busy,
  error,
  onToggle,
  onClose,
  onSave,
}: OrganizationAssignmentModalProps) {
  return (
    <div
      className="branch-management-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        className="branch-management-modal organization-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="organization-assignment-title"
      >
        <header>
          <div>
            <span className="branch-report-eyebrow">PHÂN CÔNG</span>
            <h2 id="organization-assignment-title">{title}</h2>
          </div>
          <button type="button" className="organization-modal-close" disabled={busy} onClick={onClose}>
            Đóng
          </button>
        </header>
        <p>{description}</p>
        <p className="organization-warning">{warning}</p>
        {error && <div className="dentist-error" role="alert">{error}</div>}

        {options.length > 0 ? (
          <div className="organization-checkbox-grid">
            {options.map((option) => (
              <label key={option.id} className="organization-checkbox">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(option.id)}
                  onChange={() => onToggle(option.id)}
                />
                <span>
                  {option.label}
                  {option.hint && <small>{option.hint}</small>}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="branch-report-empty">{emptyText}</p>
        )}

        <div className="organization-modal-actions">
          <button type="button" className="button-secondary" disabled={busy} onClick={onClose}>
            Hủy
          </button>
          <button type="button" disabled={busy} onClick={onSave}>
            {busy ? 'Đang lưu...' : 'Lưu phân công'}
          </button>
        </div>
      </section>
    </div>
  )
}
