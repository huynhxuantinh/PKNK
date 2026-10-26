import { useEffect, useState } from 'react'

import {
  createOrganizationService,
  listOrganizationServices,
  updateOrganizationService,
  type OrganizationService,
} from '../api/organization'
import { ConfirmationModal } from '../components/ConfirmationModal'
import { OrganizationPageLayout } from '../components/organization-management/OrganizationPageLayout'
import { OrganizationServiceModal } from '../components/organization-management/OrganizationServiceModal'
import { useOrganizationScope } from '../components/organization-management/useOrganizationScope'
import {
  buildServiceInput,
  emptyServiceForm,
  serviceToForm,
  type ServiceFormState,
} from '../features/organization/organizationValidation'
import { formatVnd } from '../components/branch-management/branchReportPresentation'

export function OrganizationServicesPage() {
  const scope = useOrganizationScope()
  const [services, setServices] = useState<OrganizationService[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingService, setEditingService] = useState<OrganizationService | null>(null)
  const [form, setForm] = useState<ServiceFormState>(emptyServiceForm)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<OrganizationService | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const organizationName =
    scope.options.find((option) => option.id === scope.organizationId)?.name
    || 'Quản trị tổ chức'

  useEffect(() => {
    if (!scope.organizationId) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    listOrganizationServices(scope.organizationId, controller.signal)
      .then((response) => setServices(response.data))
      .catch((caught) => {
        if (controller.signal.aborted) return
        setServices([])
        setError(caught instanceof Error ? caught.message : 'Không thể tải dịch vụ.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [scope.organizationId, reloadKey])

  function openCreate() {
    setEditingService(null)
    setForm(emptyServiceForm())
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(service: OrganizationService) {
    setEditingService(service)
    setForm(serviceToForm(service))
    setFormError('')
    setModalOpen(true)
  }

  async function submitService() {
    if (!scope.organizationId) return
    let input
    try {
      input = buildServiceInput(form)
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Dữ liệu dịch vụ chưa hợp lệ.')
      return
    }
    setBusy(true)
    setFormError('')
    setNotice('')
    try {
      if (editingService) {
        await updateOrganizationService(editingService.id_service, input)
        setNotice('Đã cập nhật dịch vụ.')
      } else {
        await createOrganizationService(scope.organizationId, input)
        setNotice('Đã tạo dịch vụ.')
      }
      setModalOpen(false)
      setEditingService(null)
      setReloadKey((current) => current + 1)
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Không thể lưu dịch vụ.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(service: OrganizationService) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await updateOrganizationService(service.id_service, { is_active: !service.is_active })
      setConfirming(null)
      setNotice(service.is_active ? 'Đã ngưng dịch vụ.' : 'Đã kích hoạt dịch vụ.')
      setReloadKey((current) => current + 1)
    } catch (caught) {
      setConfirming(null)
      setError(caught instanceof Error ? caught.message : 'Không thể cập nhật dịch vụ.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <OrganizationPageLayout
      title="Dịch vụ"
      path="/quan-ly-to-chuc/dich-vu"
      active="services"
      organizationId={scope.organizationId}
      options={scope.options}
      onSelectOrganization={scope.selectOrganization}
      heroKicker="Danh mục dịch vụ"
      heroTitle={organizationName}
      heroDescription="Chuẩn hóa danh mục dịch vụ dùng chung. Giá và thời lượng riêng của từng chi nhánh được cấu hình ở trang Cấu hình chi nhánh."
      heroAside={
        <button type="button" className="organization-hero-button" onClick={openCreate}>
          Thêm dịch vụ
        </button>
      }
    >
      {error && <div className="dentist-error" role="alert">{error}</div>}
      {notice && <div className="staff-schedule-notice" role="status">{notice}</div>}

      <p className="organization-hint">
        Giá và thời lượng riêng theo chi nhánh được cấu hình tại trang Cấu hình chi nhánh.
        Trang này chỉ quản lý danh mục dịch vụ dùng chung của tổ chức.
      </p>

      <section className="branch-management-schedule organization-report-section" aria-labelledby="organization-services-title">
        <header>
          <div>
            <span className="branch-report-eyebrow">DANH MỤC DỊCH VỤ</span>
            <h2 id="organization-services-title">Dịch vụ của tổ chức</h2>
          </div>
          <small>{services.filter((service) => service.is_active).length} đang hoạt động</small>
        </header>

        {loading ? (
          <p role="status">Đang tải dịch vụ...</p>
        ) : services.length > 0 ? (
          <div className="branch-report-table-wrap">
            <table className="branch-report-table organization-report-table">
              <thead>
                <tr>
                  <th>Dịch vụ</th>
                  <th>Thời lượng</th>
                  <th>Giá chuẩn</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service.id_service}>
                    <td>
                      <strong>{service.name}</strong>
                      <small>{service.code}{service.description ? ` · ${service.description}` : ''}</small>
                    </td>
                    <td>
                      {service.standard_duration_minutes} phút
                      {service.buffer_minutes > 0 && (
                        <small> · đệm {service.buffer_minutes} phút</small>
                      )}
                    </td>
                    <td>{formatVnd(service.standard_price)}</td>
                    <td>
                      <span className={`organization-status ${service.is_active ? 'is-active' : 'is-inactive'}`}>
                        {service.is_active ? 'Đang hoạt động' : 'Đã ngưng'}
                      </span>
                    </td>
                    <td>
                      <div className="organization-row-actions">
                        <button type="button" onClick={() => openEdit(service)}>Sửa</button>
                        <button
                          type="button"
                          className={service.is_active ? 'is-danger' : undefined}
                          disabled={busy}
                          onClick={() => {
                            if (service.is_active) setConfirming(service)
                            else void toggleActive(service)
                          }}
                        >
                          {service.is_active ? 'Ngưng' : 'Kích hoạt'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="branch-report-empty">Tổ chức chưa có dịch vụ.</p>
        )}
      </section>

      {modalOpen && (
        <OrganizationServiceModal
          service={editingService}
          form={form}
          busy={busy}
          error={formError}
          onChange={(changes) => setForm((current) => ({ ...current, ...changes }))}
          onClose={() => {
            if (!busy) {
              setModalOpen(false)
              setEditingService(null)
            }
          }}
          onSubmit={() => void submitService()}
        />
      )}

      {confirming && (
        <ConfirmationModal
          title="Ngưng hoạt động dịch vụ"
          description={`Ngưng dịch vụ ${confirming.name}? Nếu dịch vụ còn lịch hẹn tương lai, hệ thống sẽ từ chối thao tác.`}
          confirmLabel="Ngưng dịch vụ"
          danger
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void toggleActive(confirming)}
        />
      )}
    </OrganizationPageLayout>
  )
}
