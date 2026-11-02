import type { FormEvent } from 'react'

import type { OrganizationAdminRole, OrganizationBranch } from '../../api/organization'
import { AdminModal } from '../admin/ui'

export interface InviteFormState {
  email: string
  role: OrganizationAdminRole
  branchId: string
}

interface OrganizationInviteModalProps {
  form: InviteFormState
  branches: OrganizationBranch[]
  occupiedBranchIds: number[]
  busy: boolean
  error: string
  requiresBranch: boolean
  transfer?: { branchName: string; managerEmail: string }
  onChange: (changes: Partial<InviteFormState>) => void
  onClose: () => void
  onSubmit: () => void
}

export function OrganizationInviteModal({
  form,
  branches,
  occupiedBranchIds,
  busy,
  error,
  requiresBranch,
  transfer,
  onChange,
  onClose,
  onSubmit,
}: OrganizationInviteModalProps) {
  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <AdminModal
      open
      title="Mời quản trị viên"
      description={transfer
        ? `Quản lý hiện tại (${transfer.managerEmail}) vẫn giữ quyền cho đến khi người mới chấp nhận lời mời.`
        : "Vai trò chỉ được cấp sau khi người nhận chấp nhận lời mời."}
      className="organization-modal"
      onClose={() => { if (!busy) onClose() }}
    >
        <p>
          Nhập email người cần cấp quyền. Nếu tài khoản chưa tồn tại hoặc chưa xác minh
          email, hệ thống sẽ gửi lời mời để họ hoàn tất trước khi nhận quyền.
        </p>
        {transfer && <p className="organization-warning">
          Đang chuyển giao quản lý chi nhánh {transfer.branchName}. Quyền cũ chỉ được ngừng khi người mới nhận lời mời.
        </p>}
        {error && <div className="app-error" role="alert">{error}</div>}

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
              disabled={Boolean(transfer)}
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
                disabled={Boolean(transfer)}
                onChange={(event) => onChange({ branchId: event.target.value })}
              >
                <option value="">Chọn chi nhánh</option>
                {branches
                  .filter((branch) => branch.is_active)
                  .map((branch) => {
                    const occupied = occupiedBranchIds.includes(branch.id_branch)
                    return (
                      <option
                        key={branch.id_branch}
                        value={branch.id_branch}
                        disabled={occupied}
                      >
                        {branch.name}{occupied ? ' (đã có quản lý)' : ''}
                      </option>
                    )
                  })}
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
    </AdminModal>
  )
}
