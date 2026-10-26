import { Link } from 'react-router-dom'

export type OrganizationSection =
  | 'overview'
  | 'branches'
  | 'staff'
  | 'services'
  | 'audit'

const sections: Array<{
  id: OrganizationSection
  label: string
  description: string
  path: string
}> = [
  {
    id: 'overview',
    label: 'Tổng quan',
    description: 'Doanh thu & hiệu suất',
    path: '/quan-ly-to-chuc',
  },
  {
    id: 'branches',
    label: 'Chi nhánh',
    description: 'Danh mục & địa điểm',
    path: '/quan-ly-to-chuc/chi-nhanh',
  },
  {
    id: 'staff',
    label: 'Nhân sự',
    description: 'Quản trị viên & nha sĩ',
    path: '/quan-ly-to-chuc/nhan-su',
  },
  {
    id: 'services',
    label: 'Dịch vụ',
    description: 'Danh mục dịch vụ',
    path: '/quan-ly-to-chuc/dich-vu',
  },
  {
    id: 'audit',
    label: 'Nhật ký',
    description: 'Truy vết thao tác',
    path: '/quan-ly-to-chuc/nhat-ky',
  },
]

export function OrganizationSectionNav({
  active,
  organizationId,
}: {
  active: OrganizationSection
  organizationId: number
}) {
  return (
    <nav className="management-section-nav organization-section-nav" aria-label="Chức năng quản trị tổ chức">
      {sections.map((section, index) => {
        const isActive = active === section.id
        return (
          <Link
            key={section.id}
            className={isActive ? 'is-active' : undefined}
            to={`${section.path}?to-chuc=${organizationId}`}
            aria-current={isActive ? 'page' : undefined}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div>
              <strong>{section.label}</strong>
              <small>{section.description}</small>
            </div>
          </Link>
        )
      })}
    </nav>
  )
}
