import type { FormEvent } from 'react'

import type { OrganizationDentist } from '../../api/organization'
import type { DentistFormState } from '../../features/organization/organizationValidation'

interface OrganizationDentistFormModalProps {
  dentist: OrganizationDentist | null
  form: DentistFormState
  busy: boolean
  error: string
  onChange: (changes: Partial<DentistFormState>) => void
  onClose: () => void
  onSubmit: () => void
}

export function OrganizationDentistFormModal({
  dentist,
  form,
  busy,
  error,
  onChange,
  onClose,
  onSubmit,
}: OrganizationDentistFormModalProps) {
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
        aria-labelledby="organization-dentist-form-title"
      >
        <header>
          <div>
            <span className="branch-report-eyebrow">NHA SĨ</span>
            <h2 id="organization-dentist-form-title">
              {dentist ? 'Sửa hồ sơ nha sĩ' : 'Thêm hồ sơ nha sĩ'}
            </h2>
          </div>
          <button type="button" className="organization-modal-close" disabled={busy} onClick={onClose}>
            Đóng
          </button>
        </header>

        {!dentist && (
          <p className="organization-warning">
            Nhờ nha sĩ đăng ký tài khoản và xác minh email trước, rồi nhập đúng email đó
            tại đây. Hệ thống không gửi lời mời cho nha sĩ.
          </p>
        )}
        {error && <div className="dentist-error" role="alert">{error}</div>}

        <form className="organization-form-grid" onSubmit={submit}>
          {!dentist && (
            <label className="organization-span-2">
              Email đã đăng ký
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) => onChange({ email: event.target.value })}
              />
            </label>
          )}
          <label className="organization-span-2">
            Số giấy phép hành nghề
            <input
              value={form.licenseNumber}
              onChange={(event) => onChange({ licenseNumber: event.target.value })}
            />
          </label>
          <label className="organization-span-2">
            Giới thiệu
            <textarea
              value={form.biography}
              onChange={(event) => onChange({ biography: event.target.value })}
            />
          </label>
          <div className="organization-modal-actions organization-span-2">
            <button type="button" className="button-secondary" disabled={busy} onClick={onClose}>
              Hủy
            </button>
            <button type="submit" disabled={busy}>
              {busy ? 'Đang lưu...' : dentist ? 'Lưu thay đổi' : 'Tạo hồ sơ'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
