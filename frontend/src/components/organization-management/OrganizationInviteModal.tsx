import type { FormEvent } from 'react'

import type { OrganizationAdminRole, OrganizationBranch } from '../../api/organization'

export interface InviteFormState {
  email: string
  role: OrganizationAdminRole
  branchId: string
}

interface OrganizationInviteModalProps {
  form: InviteFormState
  branches: OrganizationBranch[]
  busy: boolean
  error: string
  requiresBranch: boolean
  onChange: (changes: Partial<InviteFormState>) => void
  onClose: () => void
  onSubmit: () => void
}

export function OrganizationInviteModal({
  form,
  branches,
  busy,
  error,
  requiresBranch,
  onChange,
  onClose,
  onSubmit,
}: OrganizationInviteModalProps) {
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
        aria-labelledby="organization-invite-title"
      >
        <header>
          <div>
            <span className="branch-report-eyebrow">QUẢN TRỊ VIÊN</span>
            <h2 id="organization-invite-title">Mời quản trị viên</h2>
          </div>
          <button type="button" className="organization-modal-close" disabled={busy} onClick={onClose}>
            Đóng
          </button>
        </header>
        <p>
          Nhập email người cần cấp quyền. Nếu tài khoản chưa tồn tại hoặc chưa xác minh
          email, hệ thống sẽ gửi lời mời để họ hoàn tất trước khi nhận quyền.
        </p>
        {error && <div className="dentist-error" role="alert">{error}</div>}

        <form className="organization-form-grid" onSubmit={submit}>
          <label className="organization-span-2">
            Email
            <input
              required
              type="email"
              value={form.email}
              onChange={(event) => onChange({ email: event.target.value })}
            />
          </label>
          <label>
            Vai trò
            <select
              value={form.role}
              onChange={(event) => {
                const role = event.target.value as OrganizationAdminRole
                onChange({
                  role,
                  ...(role === 'ORGANIZATION_ADMIN' ? { branchId: '' } : {}),
                })
              }}
            >
              <option value="ORGANIZATION_ADMIN">Quản trị tổ chức</option>
              <option value="BRANCH_ADMIN">Quản lý chi nhánh</option>
            </select>
          </label>
          {requiresBranch && (
            <label>
              Chi nhánh
              <select
                required
                value={form.branchId}
                onChange={(event) => onChange({ branchId: event.target.value })}
              >
                <option value="">Chọn chi nhánh</option>
                {branches
                  .filter((branch) => branch.is_active)
                  .map((branch) => (
                    <option key={branch.id_branch} value={branch.id_branch}>
                      {branch.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <div className="organization-modal-actions organization-span-2">
            <button type="button" className="button-secondary" disabled={busy} onClick={onClose}>
              Hủy
            </button>
            <button type="submit" disabled={busy}>
              {busy ? 'Đang gửi...' : 'Gửi lời mời'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
