import { useEffect, useMemo, useState } from 'react'

import {
  createOrganizationMembership,
  listOrganizationInvitations,
  listOrganizationMemberships,
  revokeOrganizationInvitation,
  updateOrganizationMembership,
  type OrganizationBranch,
  type OrganizationInvitation,
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
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<InviteFormState>(emptyInvite)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<OrganizationMembership | null>(null)
  const [revokingInvitation, setRevokingInvitation] =
    useState<OrganizationInvitation | null>(null)
  const [changingManager, setChangingManager] = useState<{
    branch: OrganizationBranch
    manager: OrganizationMembership
  } | null>(null)
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
    listOrganizationInvitations(organizationId, controller.signal)
      .then((response) => setInvitations(response.data))
      .catch((caught) => {
        if (controller.signal.aborted) return
        setInvitations([])
        setError(caught instanceof Error ? caught.message : 'Không thể tải lời mời.')
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
  const organizationAdmins = useMemo(
    () => adminMemberships.filter(
      (membership) => membership.role === 'ORGANIZATION_ADMIN',
    ),
    [adminMemberships],
  )
  const activeBranchAdmins = useMemo(
    () => adminMemberships.filter(
      (membership) => membership.role === 'BRANCH_ADMIN' && membership.is_active,
    ),
    [adminMemberships],
  )
  const activeBranches = useMemo(
    () => branches.filter((branch) => branch.is_active),
    [branches],
  )
  const managerByBranch = useMemo(
    () => new Map(
      activeBranchAdmins
        .filter((membership) => membership.branch_id !== null)
        .map((membership) => [membership.branch_id as number, membership]),
    ),
    [activeBranchAdmins],
  )
  const missingManagerBranches = useMemo(
    () => activeBranches.filter((branch) => !managerByBranch.has(branch.id_branch)),
    [activeBranches, managerByBranch],
  )
  const availableBranches = missingManagerBranches

  function branchName(branchId: number | null) {
    if (!branchId) return 'Toàn tổ chức'
    return branches.find((branch) => branch.id_branch === branchId)?.name
      || `Chi nhánh #${branchId}`
  }

  function openInvite(branchId = '') {
    setForm({ ...emptyInvite(), branchId })
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

  async function revokeInvitation() {
    if (!revokingInvitation) return
    const invitation = revokingInvitation
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await revokeOrganizationInvitation(invitation.id_staff_invitation)
      setRevokingInvitation(null)
      setNotice(`Đã thu hồi lời mời tới ${invitation.email}.`)
      setReloadKey((current) => current + 1)
    } catch (caught) {
      setRevokingInvitation(null)
      setError(caught instanceof Error ? caught.message : 'Không thể thu hồi lời mời.')
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

  async function deactivateManagerForChange() {
    if (!changingManager) return
    const { branch, manager } = changingManager
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await updateOrganizationMembership(manager.id_membership, { is_active: false })
      setChangingManager(null)
      setNotice(
        `Đã ngưng quyền của ${manager.user_email}. Hãy mời quản lý mới cho ${branch.name}.`,
      )
      setForm({ ...emptyInvite(), branchId: String(branch.id_branch) })
      setFormError('')
      setModalOpen(true)
      setReloadKey((current) => current + 1)
    } catch (caught) {
      setChangingManager(null)
      setError(caught instanceof Error ? caught.message : 'Không thể đổi quản lý chi nhánh.')
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
        <button type="button" className="organization-primary-button" onClick={() => openInvite()}>
          Mời quản trị viên
        </button>
      </header>

      <p className="organization-hint">
        Chỉ hiển thị quản trị tổ chức và quản lý chi nhánh. Mỗi chi nhánh có đúng
        một quản lý đang hoạt động. Lời mời chưa được chấp nhận nằm ở mục
        “Đang chờ” bên dưới và có thể thu hồi bất cứ lúc nào.
      </p>
      {missingManagerBranches.length > 0 && (
        <p className="organization-warning">
          {missingManagerBranches.length} chi nhánh chưa có quản lý:{' '}
          <strong>
            {missingManagerBranches.map((branch) => branch.name).join(', ')}
          </strong>
          . Hãy mời quản lý cho các chi nhánh còn thiếu.
        </p>
      )}

      {error && <div className="dentist-error" role="alert">{error}</div>}
      {notice && <div className="staff-schedule-notice" role="status">{notice}</div>}

      {loading ? (
        <p role="status">Đang tải quản trị viên...</p>
      ) : organizationAdmins.length > 0 || activeBranches.length > 0 ? (
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
              {organizationAdmins.map((membership) => (
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
              {activeBranches.map((branch) => {
                const manager = managerByBranch.get(branch.id_branch)
                return (
                  <tr key={`branch-${branch.id_branch}`}>
                    <td>
                      <strong>
                        {manager
                          ? manager.user_full_name || 'Chưa đặt tên'
                          : 'Chưa có quản lý'}
                      </strong>
                      <small>
                        {manager
                          ? manager.user_email
                          : 'Chi nhánh chưa được phân công quản lý'}
                      </small>
                    </td>
                    <td>{organizationRoleLabel('BRANCH_ADMIN')}</td>
                    <td>{branch.name}</td>
                    <td>
                      {manager ? (
                        <span className="organization-status is-active">
                          Đang hoạt động
                        </span>
                      ) : (
                        <span className="organization-status is-inactive">
                          Chưa có quản lý
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="organization-row-actions">
                        {manager ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setChangingManager({ branch, manager })}
                          >
                            Đổi người
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openInvite(String(branch.id_branch))}
                          >
                            Mời
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="branch-report-empty">Tổ chức chưa có quản trị viên.</p>
      )}

      {!loading && (
        <section
          className="organization-pending"
          aria-labelledby="organization-pending-title"
        >
          <header>
            <div>
              <span className="branch-report-eyebrow">ĐANG CHỜ</span>
              <h3 id="organization-pending-title">Lời mời chưa được chấp nhận</h3>
            </div>
            <span className="organization-status is-inactive">
              {invitations.length} lời mời
            </span>
          </header>
          {invitations.length === 0 ? (
            <p className="branch-report-empty">Không có lời mời đang chờ.</p>
          ) : (
            <div className="branch-report-table-wrap">
              <table className="branch-report-table organization-report-table">
                <thead>
                  <tr>
                    <th>Người được mời</th>
                    <th>Vai trò</th>
                    <th>Chi nhánh</th>
                    <th>Hết hạn</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((invitation) => (
                    <tr key={invitation.id_staff_invitation}>
                      <td>
                        <strong>{invitation.email}</strong>
                        <small>Mời bởi {invitation.invited_by_email}</small>
                      </td>
                      <td>{organizationRoleLabel(invitation.role)}</td>
                      <td>{invitation.branch_name || branchName(invitation.branch_id)}</td>
                      <td>{new Date(invitation.expires_at).toLocaleString('vi-VN')}</td>
                      <td>
                        <div className="organization-row-actions">
                          <button
                            type="button"
                            className="is-danger"
                            disabled={busy}
                            onClick={() => setRevokingInvitation(invitation)}
                          >
                            Thu hồi
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {modalOpen && (
        <OrganizationInviteModal
          form={form}
          branches={availableBranches}
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

      {changingManager && (
        <ConfirmationModal
          title="Đổi quản lý chi nhánh"
          description={`Ngưng quyền quản lý của ${changingManager.manager.user_email} tại ${changingManager.branch.name} để mời người mới? Chi nhánh sẽ chưa có quản lý cho tới khi người mới nhận lời mời.`}
          confirmLabel="Ngưng và mời người mới"
          danger
          busy={busy}
          onCancel={() => setChangingManager(null)}
          onConfirm={() => void deactivateManagerForChange()}
        />
      )}

      {revokingInvitation && (
        <ConfirmationModal
          title="Thu hồi lời mời"
          description={`Thu hồi lời mời tới ${revokingInvitation.email}? Link trong email sẽ không còn dùng được.`}
          confirmLabel="Thu hồi lời mời"
          danger
          busy={busy}
          onCancel={() => setRevokingInvitation(null)}
          onConfirm={() => void revokeInvitation()}
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
