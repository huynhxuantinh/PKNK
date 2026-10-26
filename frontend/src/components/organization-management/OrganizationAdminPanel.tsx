import { useEffect, useMemo, useState } from 'react'

import {
  createOrganizationMembership,
  listOrganizationMemberships,
  updateOrganizationMembership,
  type OrganizationBranch,
  type OrganizationMembership,
} from '../../api/organization'
import { ConfirmationModal } from '../ConfirmationModal'
import {
  OrganizationInviteModal,
  type InviteFormState,
} from './OrganizationInviteModal'
import { organizationRoleLabel } from '../../features/organization/organizationSelection'
import { validateMembershipInvite } from '../../features/organization/organizationValidation'

const emptyInvite = (): InviteFormState => ({
  email: '',
  role: 'BRANCH_ADMIN',
  branchId: '',
})

export function OrganizationAdminPanel({
  organizationId,
  branches,
  currentUserId,
}: {
  organizationId: number
  branches: OrganizationBranch[]
  currentUserId: number
}) {
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<InviteFormState>(emptyInvite)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<OrganizationMembership | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    listOrganizationMemberships(organizationId, controller.signal)
      .then((response) => setMemberships(response.data))
      .catch((caught) => {
        if (controller.signal.aborted) return
        setMemberships([])
        setError(caught instanceof Error ? caught.message : 'Không thể tải quản trị viên.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [organizationId, reloadKey])

  const adminMemberships = useMemo(
    () => memberships.filter(
      (membership) => (
        membership.role === 'ORGANIZATION_ADMIN' || membership.role === 'BRANCH_ADMIN'
      ),
    ),
    [memberships],
  )
  const activeBranchAdmins = useMemo(
    () => adminMemberships.filter(
      (membership) => membership.role === 'BRANCH_ADMIN' && membership.is_active,
    ),
    [adminMemberships],
  )

  function branchName(branchId: number | null) {
    if (!branchId) return 'Toàn tổ chức'
    return branches.find((branch) => branch.id_branch === branchId)?.name
      || `Chi nhánh #${branchId}`
  }

  function openInvite() {
    setForm(emptyInvite())
    setFormError('')
    setModalOpen(true)
  }

  async function invite() {
    const validationError = validateMembershipInvite({
      email: form.email,
      role: form.role,
      branchId: form.branchId,
    })
    if (validationError) {
      setFormError(validationError)
      return
    }
    setBusy(true)
    setFormError('')
    setNotice('')
    try {
      const response = await createOrganizationMembership(organizationId, {
        email: form.email.trim(),
        role: form.role,
        branch_id: form.role === 'BRANCH_ADMIN' ? Number(form.branchId) : null,
      })
      if ('status' in response.data) {
        setNotice(`Đã gửi lời mời tới ${form.email.trim()}.`)
      } else {
        setNotice('Đã thêm quản trị viên.')
      }
      setModalOpen(false)
      setReloadKey((current) => current + 1)
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Không thể mời quản trị viên.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleMembership(membership: OrganizationMembership) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await updateOrganizationMembership(membership.id_membership, {
        is_active: !membership.is_active,
      })
      setConfirming(null)
      setNotice(membership.is_active ? 'Đã ngưng quyền quản trị.' : 'Đã kích hoạt quyền quản trị.')
      setReloadKey((current) => current + 1)
    } catch (caught) {
      setConfirming(null)
      setError(caught instanceof Error ? caught.message : 'Không thể cập nhật quyền quản trị.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="branch-management-schedule organization-report-section" aria-labelledby="organization-admins-title">
      <header>
        <div>
          <span className="branch-report-eyebrow">QUẢN TRỊ VIÊN</span>
          <h2 id="organization-admins-title">Đội ngũ quản trị</h2>
        </div>
        <button type="button" className="organization-primary-button" onClick={openInvite}>
          Mời quản trị viên
        </button>
      </header>

      <p className="organization-hint">
        Chỉ hiển thị quản trị tổ chức và quản lý chi nhánh. Mỗi chi nhánh nên có đúng
        một quản lý đang hoạt động.
      </p>
      {activeBranchAdmins.length < branches.filter((branch) => branch.is_active).length && (
        <p className="organization-warning">
          Có chi nhánh chưa có quản lý. Hãy mời quản lý cho các chi nhánh còn thiếu.
        </p>
      )}

      {error && <div className="dentist-error" role="alert">{error}</div>}
      {notice && <div className="staff-schedule-notice" role="status">{notice}</div>}

      {loading ? (
        <p role="status">Đang tải quản trị viên...</p>
      ) : adminMemberships.length > 0 ? (
        <div className="branch-report-table-wrap">
          <table className="branch-report-table organization-report-table">
            <thead>
              <tr>
                <th>Thành viên</th>
                <th>Vai trò</th>
                <th>Chi nhánh</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {adminMemberships.map((membership) => (
                <tr key={membership.id_membership}>
                  <td>
                    <strong>{membership.user_full_name || 'Chưa đặt tên'}</strong>
                    <small>{membership.user_email}</small>
                  </td>
                  <td>{organizationRoleLabel(membership.role)}</td>
                  <td>{branchName(membership.branch_id)}</td>
                  <td>
                    <span className={`organization-status ${membership.is_active ? 'is-active' : 'is-inactive'}`}>
                      {membership.is_active ? 'Đang hoạt động' : 'Đã ngưng'}
                    </span>
                  </td>
                  <td>
                    <div className="organization-row-actions">
                      <button
                        type="button"
                        className={membership.is_active ? 'is-danger' : undefined}
                        disabled={busy}
                        onClick={() => {
                          if (membership.is_active) setConfirming(membership)
                          else void toggleMembership(membership)
                        }}
                      >
                        {membership.is_active ? 'Ngưng' : 'Kích hoạt'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="branch-report-empty">Tổ chức chưa có quản trị viên.</p>
      )}

      {modalOpen && (
        <OrganizationInviteModal
          form={form}
          branches={branches}
          busy={busy}
          error={formError}
          requiresBranch={form.role === 'BRANCH_ADMIN'}
          onChange={(changes) => setForm((current) => ({ ...current, ...changes }))}
          onClose={() => {
            if (!busy) setModalOpen(false)
          }}
          onSubmit={() => void invite()}
        />
      )}

      {confirming && (
        <ConfirmationModal
          title="Ngưng quyền quản trị"
          description={
            confirming.user_id === currentUserId
              ? `Bạn đang tự ngưng quyền của chính mình (${confirming.user_email}). Bạn có thể mất quyền truy cập khu vực quản trị ngay sau thao tác này. Tiếp tục?`
              : `Ngưng quyền quản trị của ${confirming.user_email}? Người này sẽ không còn truy cập khu vực quản trị.`
          }
          confirmLabel="Ngưng quyền"
          danger
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void toggleMembership(confirming)}
        />
      )}
    </section>
  )
}
