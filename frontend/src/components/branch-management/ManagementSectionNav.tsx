import { Link } from 'react-router-dom'

type ManagementSection = 'appointments' | 'staff' | 'reports'

interface ManagementSectionNavProps {
  branchId: number
  active: ManagementSection
}

const sections: Array<{ id: ManagementSection; label: string; description: string; path: string }> = [
  { id: 'appointments', label: 'Lịch hẹn', description: 'Điều phối lịch khám', path: '/quan-ly-chi-nhanh' },
  { id: 'staff', label: 'Ca làm & nghỉ phép', description: 'Sắp xếp nha sĩ', path: '/quan-ly-chi-nhanh/ca-lam' },
  { id: 'reports', label: 'Báo cáo', description: 'Doanh thu & hiệu suất', path: '/quan-ly-chi-nhanh/bao-cao' },
]

export function ManagementSectionNav({ branchId, active }: ManagementSectionNavProps) {
  return <nav className="management-section-nav" aria-label="Chức năng quản lý chi nhánh">
    {sections.map((section, index) => {
      const isActive = active === section.id
      return <Link key={section.id} className={isActive ? 'is-active' : undefined} to={`${section.path}?chi-nhanh=${branchId}`} aria-current={isActive ? 'page' : undefined}>
        <span>{String(index + 1).padStart(2, '0')}</span>
        <div><strong>{section.label}</strong><small>{section.description}</small></div>
      </Link>
    })}
  </nav>
}
