import { useEffect, useMemo, useState } from 'react'

import {
  listOrganizationBranches,
  listOrganizationServices,
  type OrganizationBranch,
  type OrganizationService,
} from '../api/organization'
import { OrganizationAdminPanel } from '../components/organization-management/OrganizationAdminPanel'
import { OrganizationDentistPanel } from '../components/organization-management/OrganizationDentistPanel'
import { OrganizationPageLayout } from '../components/organization-management/OrganizationPageLayout'
import { useOrganizationScope } from '../components/organization-management/useOrganizationScope'

type StaffTab = 'admins' | 'dentists'

const tabs: Array<{ id: StaffTab; label: string; description: string }> = [
  {
    id: 'admins',
    label: 'Quản trị viên',
    description: 'Quản trị tổ chức và quản lý chi nhánh',
  },
  {
    id: 'dentists',
    label: 'Nha sĩ',
    description: 'Hồ sơ, chi nhánh và dịch vụ',
  },
]

export function OrganizationStaffPage() {
  const scope = useOrganizationScope()
  const [tab, setTab] = useState<StaffTab>('admins')
  const [branches, setBranches] = useState<OrganizationBranch[]>([])
  const [services, setServices] = useState<OrganizationService[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const organizationName =
    scope.options.find((option) => option.id === scope.organizationId)?.name
    || 'Quản trị tổ chức'

  useEffect(() => {
    if (!scope.organizationId) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    Promise.all([
      listOrganizationBranches(scope.organizationId, controller.signal),
      listOrganizationServices(scope.organizationId, controller.signal),
    ])
      .then(([branchResponse, serviceResponse]) => {
        if (controller.signal.aborted) return
        setBranches(branchResponse.data)
        setServices(serviceResponse.data)
      })
      .catch((caught) => {
        if (controller.signal.aborted) return
        setBranches([])
        setServices([])
        setError(caught instanceof Error ? caught.message : 'Không thể tải dữ liệu nhân sự.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [scope.organizationId])

  const activeBranches = useMemo(
    () => branches.filter((branch) => branch.is_active),
    [branches],
  )

  return (
    <OrganizationPageLayout
      title="Nhân sự"
      path="/quan-ly-to-chuc/nhan-su"
      active="staff"
      organizationId={scope.organizationId}
      options={scope.options}
      onSelectOrganization={scope.selectOrganization}
      heroKicker="Đội ngũ tổ chức"
      heroTitle={organizationName}
      heroDescription="Cấp quyền quản trị và quản lý hồ sơ nha sĩ, chi nhánh làm việc cùng danh mục dịch vụ."
      heroAside={
        <span className="organization-hero-stat">
          {activeBranches.length} chi nhánh đang hoạt động
        </span>
      }
    >
      {error && <div className="dentist-error" role="alert">{error}</div>}

      <div className="organization-tabs" role="tablist" aria-label="Nhóm nhân sự">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'is-active' : undefined}
            onClick={() => setTab(item.id)}
          >
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="branch-report-loading" role="status">Đang tải dữ liệu nhân sự...</p>
      ) : scope.organizationId ? (
        tab === 'admins' ? (
          <OrganizationAdminPanel
            organizationId={scope.organizationId}
            branches={branches}
            currentUserId={scope.user?.id_user || 0}
          />
        ) : (
          <OrganizationDentistPanel
            organizationId={scope.organizationId}
            branches={branches}
            services={services}
          />
        )
      ) : null}
    </OrganizationPageLayout>
  )
}
