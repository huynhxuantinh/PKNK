import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  createOrganizationBranch,
  listOrganizationBranches,
  listProvinces,
  listWards,
  updateOrganizationBranch,
  type OrganizationBranch,
} from '../api/organization'
import { ConfirmationModal } from '../components/ConfirmationModal'
import { OrganizationBranchModal } from '../components/organization-management/OrganizationBranchModal'
import { OrganizationPageLayout } from '../components/organization-management/OrganizationPageLayout'
import { useOrganizationScope } from '../components/organization-management/useOrganizationScope'
import {
  branchToForm,
  buildBranchInput,
  emptyBranchForm,
  type BranchFormState,
} from '../features/organization/organizationValidation'
import type { AdministrativeOption } from '../types/api'

export function OrganizationBranchesPage() {
  const scope = useOrganizationScope()
  const [branches, setBranches] = useState<OrganizationBranch[]>([])
  const [provinces, setProvinces] = useState<AdministrativeOption[]>([])
  const [wards, setWards] = useState<AdministrativeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingWards, setLoadingWards] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<OrganizationBranch | null>(null)
  const [form, setForm] = useState<BranchFormState>(emptyBranchForm)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmingBranch, setConfirmingBranch] = useState<OrganizationBranch | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const wardControllerRef = useRef<AbortController | null>(null)
  const organizationName =
    scope.options.find((option) => option.id === scope.organizationId)?.name
    || 'Quản trị tổ chức'

  useEffect(() => {
    const controller = new AbortController()
    listProvinces(controller.signal)
      .then((response) => setProvinces(response.data))
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : 'Không thể tải tỉnh/thành.')
        }
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!scope.organizationId) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    listOrganizationBranches(scope.organizationId, controller.signal)
      .then((response) => setBranches(response.data))
      .catch((caught) => {
        if (controller.signal.aborted) return
        setBranches([])
        setError(caught instanceof Error ? caught.message : 'Không thể tải chi nhánh.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [scope.organizationId, reloadKey])

  function loadWards(provinceCode: string) {
    wardControllerRef.current?.abort()
    if (!provinceCode) {
      setWards([])
      setLoadingWards(false)
      return
    }
    const controller = new AbortController()
    wardControllerRef.current = controller
    setLoadingWards(true)
    listWards(provinceCode, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setWards(response.data)
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setWards([])
          setFormError(caught instanceof Error ? caught.message : 'Không thể tải phường/xã.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingWards(false)
      })
  }

  function openCreate() {
    setEditingBranch(null)
    setForm(emptyBranchForm())
    setWards([])
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(branch: OrganizationBranch) {
    setEditingBranch(branch)
    setForm(branchToForm(branch))
    setFormError('')
    setModalOpen(true)
    setWards([])
    loadWards(branch.province_code)
  }

  function changeProvince(provinceCode: string) {
    setForm((current) => ({ ...current, provinceCode, wardCode: '' }))
    loadWards(provinceCode)
  }

  async function submitBranch() {
    if (!scope.organizationId) return
    let input
    try {
      input = buildBranchInput(form)
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Dữ liệu chi nhánh chưa hợp lệ.')
      return
    }

    setBusy(true)
    setFormError('')
    setNotice('')
    try {
      if (editingBranch) {
        await updateOrganizationBranch(editingBranch.id_branch, input)
        setNotice('Đã cập nhật chi nhánh.')
      } else {
        await createOrganizationBranch(scope.organizationId, input)
        setNotice('Đã tạo chi nhánh.')
      }
      setModalOpen(false)
      setEditingBranch(null)
      setReloadKey((current) => current + 1)
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Không thể lưu chi nhánh.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(branch: OrganizationBranch) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await updateOrganizationBranch(branch.id_branch, { is_active: !branch.is_active })
      setConfirmingBranch(null)
      setNotice(branch.is_active ? 'Đã ngưng hoạt động chi nhánh.' : 'Đã kích hoạt chi nhánh.')
      setReloadKey((current) => current + 1)
    } catch (caught) {
      setConfirmingBranch(null)
      setError(caught instanceof Error ? caught.message : 'Không thể cập nhật chi nhánh.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <OrganizationPageLayout
      title="Chi nhánh"
      path="/quan-ly-to-chuc/chi-nhanh"
      active="branches"
      organizationId={scope.organizationId}
      options={scope.options}
      onSelectOrganization={scope.selectOrganization}
      heroKicker="Mạng lưới chi nhánh"
      heroTitle={organizationName}
      heroDescription="Quản lý danh mục, địa chỉ và trạng thái hoạt động của từng chi nhánh."
      heroAside={
        <button type="button" className="organization-hero-button" onClick={openCreate}>
          Thêm chi nhánh
        </button>
      }
    >
      {error && <div className="dentist-error" role="alert">{error}</div>}
      {notice && <div className="staff-schedule-notice" role="status">{notice}</div>}

      <section className="branch-management-schedule organization-report-section" aria-labelledby="organization-branches-title">
        <header>
          <div>
            <span className="branch-report-eyebrow">DANH MỤC CHI NHÁNH</span>
            <h2 id="organization-branches-title">Chi nhánh của tổ chức</h2>
          </div>
          <small>{branches.filter((branch) => branch.is_active).length} đang hoạt động</small>
        </header>

        {loading ? (
          <p role="status">Đang tải chi nhánh...</p>
        ) : branches.length > 0 ? (
          <div className="branch-report-table-wrap">
            <table className="branch-report-table organization-report-table">
              <thead>
                <tr>
                  <th>Chi nhánh</th>
                  <th>Liên hệ</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((branch) => (
                  <tr key={branch.id_branch}>
                    <td>
                      <strong>{branch.name}</strong>
                      <small>{branch.code} · {branch.address_line}</small>
                    </td>
                    <td>
                      {branch.phone || '—'}
                      <small>{branch.email || 'Chưa có email'}</small>
                    </td>
                    <td>
                      <span className={`organization-status ${branch.is_active ? 'is-active' : 'is-inactive'}`}>
                        {branch.is_active ? 'Đang hoạt động' : 'Đã ngưng'}
                      </span>
                    </td>
                    <td>
                      <div className="organization-row-actions">
                        <button type="button" onClick={() => openEdit(branch)}>Sửa</button>
                        <button
                          type="button"
                          className={branch.is_active ? 'is-danger' : undefined}
                          disabled={busy}
                          onClick={() => {
                            if (branch.is_active) setConfirmingBranch(branch)
                            else void toggleActive(branch)
                          }}
                        >
                          {branch.is_active ? 'Ngưng' : 'Kích hoạt'}
                        </button>
                        {branch.is_active && (
                          <Link to={`/quan-ly-chi-nhanh?chi-nhanh=${branch.id_branch}`}>
                            Vận hành chi nhánh
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="branch-report-empty">Tổ chức chưa có chi nhánh.</p>
        )}
      </section>

      {modalOpen && (
        <OrganizationBranchModal
          branch={editingBranch}
          form={form}
          provinces={provinces}
          wards={wards}
          loadingWards={loadingWards}
          busy={busy}
          error={formError}
          onChange={(changes) => setForm((current) => ({ ...current, ...changes }))}
          onProvinceChange={changeProvince}
          onClose={() => {
            if (!busy) {
              setModalOpen(false)
              setEditingBranch(null)
            }
          }}
          onSubmit={() => void submitBranch()}
        />
      )}

      {confirmingBranch && (
        <ConfirmationModal
          title="Ngưng hoạt động chi nhánh"
          description={`Chi nhánh ${confirmingBranch.name} sẽ không còn nhận lịch mới. Nếu còn lịch tương lai, hệ thống sẽ từ chối thao tác.`}
          confirmLabel="Ngưng chi nhánh"
          danger
          busy={busy}
          onCancel={() => setConfirmingBranch(null)}
          onConfirm={() => void toggleActive(confirmingBranch)}
        />
      )}
    </OrganizationPageLayout>
  )
}
