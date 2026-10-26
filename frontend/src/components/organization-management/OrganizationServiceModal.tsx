import type { FormEvent } from 'react'

import type { OrganizationService } from '../../api/organization'
import type { ServiceFormState } from '../../features/organization/organizationValidation'

interface OrganizationServiceModalProps {
  service: OrganizationService | null
  form: ServiceFormState
  busy: boolean
  error: string
  onChange: (changes: Partial<ServiceFormState>) => void
  onClose: () => void
  onSubmit: () => void
}

export function OrganizationServiceModal({
  service,
  form,
  busy,
  error,
  onChange,
  onClose,
  onSubmit,
}: OrganizationServiceModalProps) {
  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }

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
        aria-labelledby="organization-service-modal-title"
      >
        <header>
          <div>
            <span className="branch-report-eyebrow">DỊCH VỤ</span>
            <h2 id="organization-service-modal-title">
              {service ? 'Sửa dịch vụ' : 'Thêm dịch vụ'}
            </h2>
          </div>
          <button type="button" className="organization-modal-close" disabled={busy} onClick={onClose}>
            Đóng
          </button>
        </header>

        {error && <div className="dentist-error" role="alert">{error}</div>}

        <form className="organization-form-grid" onSubmit={submit}>
          <label>
            Mã dịch vụ
            <input
              required
              value={form.code}
              onChange={(event) => onChange({ code: event.target.value })}
            />
          </label>
          <label>
            Tên dịch vụ
            <input
              required
              value={form.name}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </label>
          <label className="organization-span-2">
            Mô tả
            <textarea
              value={form.description}
              onChange={(event) => onChange({ description: event.target.value })}
            />
          </label>
          <label>
            Thời lượng chuẩn (phút)
            <input
              required
              type="number"
              min="1"
              step="1"
              value={form.durationMinutes}
              onChange={(event) => onChange({ durationMinutes: event.target.value })}
            />
          </label>
          <label>
            Thời gian đệm (phút)
            <input
              required
              type="number"
              min="0"
              step="1"
              value={form.bufferMinutes}
              onChange={(event) => onChange({ bufferMinutes: event.target.value })}
            />
          </label>
          <label>
            Giá chuẩn (VND)
            <input
              required
              type="number"
              min="0"
              step="1000"
              value={form.standardPrice}
              onChange={(event) => onChange({ standardPrice: event.target.value })}
            />
          </label>
          <label className="organization-checkbox">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => onChange({ isActive: event.target.checked })}
            />
            Dịch vụ đang hoạt động
          </label>

          <div className="organization-modal-actions organization-span-2">
            <button type="button" className="button-secondary" disabled={busy} onClick={onClose}>
              Hủy
            </button>
            <button type="submit" disabled={busy}>
              {busy ? 'Đang lưu...' : service ? 'Lưu thay đổi' : 'Tạo dịch vụ'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
