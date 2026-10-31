import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'

import { AuthBar } from '../../auth/AuthBar'
import { useAuth } from '../../auth/AuthContext'
import { hasActiveRole } from '../../auth/roles'
import { useManagedBranches } from '../branch-management/useManagedBranches'
import { resolveScopedManagedBranchId } from '../branch-management/managedBranchSelection'
import {
  organizationOptionsForUser,
  resolveOrganizationId,
} from '../../features/organization/organizationSelection'

import './admin-shell.css'

type AdminArea = 'branch' | 'organization'
type IconName = 'calendar' | 'clock' | 'chart' | 'invoice' | 'settings' | 'building' | 'users' | 'service' | 'history' | 'home' | 'menu' | 'chevron'

type MenuItem = {
  title: string
  description: string
  path: string
  icon: IconName
}

type ScopeOption = { id: number; name: string }

const branchMenu: MenuItem[] = [
  { title: 'Lịch hẹn', description: 'Điều phối lịch khám', path: '/quan-ly-chi-nhanh', icon: 'calendar' },
  { title: 'Ca làm & nghỉ phép', description: 'Quản lý lịch nha sĩ', path: '/quan-ly-chi-nhanh/ca-lam', icon: 'clock' },
  { title: 'Hóa đơn', description: 'Thu ngân và thanh toán', path: '/quan-ly-chi-nhanh/hoa-don', icon: 'invoice' },
  { title: 'Báo cáo', description: 'Doanh thu và hiệu suất', path: '/quan-ly-chi-nhanh/bao-cao', icon: 'chart' },
  { title: 'Cấu hình', description: 'Giờ, ghế và dịch vụ', path: '/quan-ly-chi-nhanh/cau-hinh', icon: 'settings' },
]

const organizationMenu: MenuItem[] = [
  { title: 'Tổng quan', description: 'Hiệu quả toàn chuỗi', path: '/quan-ly-to-chuc', icon: 'chart' },
  { title: 'Chi nhánh', description: 'Danh sách cơ sở', path: '/quan-ly-to-chuc/chi-nhanh', icon: 'building' },
  { title: 'Nhân sự', description: 'Quản lý đội ngũ', path: '/quan-ly-to-chuc/nhan-su', icon: 'users' },
  { title: 'Dịch vụ', description: 'Danh mục toàn chuỗi', path: '/quan-ly-to-chuc/dich-vu', icon: 'service' },
  { title: 'Nhật ký', description: 'Truy vết hoạt động', path: '/quan-ly-to-chuc/nhat-ky', icon: 'history' },
]

const paths: Record<IconName, string> = {
  calendar: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 10h3v3H8z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5v5l3 2',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  invoice: 'M6 2h10l3 3v17l-4-2-4 2-4-2-4 2V5a3 3 0 0 1 3-3Zm1 7h9m-9 4h9',
  settings: 'M12 3.5a2 2 0 0 0-2 2l-1.5.7-1.9-.7-2 3.5 1.5 1.4v1.8l-1.5 1.4 2 3.5 1.9-.7 1.5.7a2 2 0 0 0 4 0l1.5-.7 1.9.7 2-3.5-1.5-1.4v-1.8l1.5-1.4-2-3.5-1.9.7-1.5-.7a2 2 0 0 0-2-2Zm0 6a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  building: 'M3 21V5l9-3 9 3v16M9 21v-6h6v6M7 8h.01M12 8h.01M17 8h.01M7 12h.01M17 12h.01',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm11 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  service: 'M20 7h-5V2H9v5H4v6h5v5h6v-5h5V7Z',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 3v5h5m4-.5V12l3 2',
  home: 'm3 10 9-7 9 7v10H3V10Zm6 10v-7h6v7',
  menu: 'M4 7h16M4 12h16M4 17h16',
  chevron: 'm9 18 6-6-6-6',
}

function AdminIcon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  )
}

interface AdminFrameProps {
  area: AdminArea
  menu: MenuItem[]
  scopeId: number | null
  scopeOptions: ScopeOption[]
  scopeParameter: string
  scopeLoading: boolean
  scopeError?: string
  onScopeChange: (scopeId: number) => void
  showOrganizationLink?: boolean
}

function AdminFrame({
  area, menu, scopeId, scopeOptions, scopeParameter, scopeLoading,
  scopeError, onScopeChange, showOrganizationLink = false,
}: AdminFrameProps) {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const activeSection = menu.find((item) => item.path === location.pathname)
  const suffix = scopeId ? '?' + scopeParameter + '=' + scopeId : ''
  const scope = scopeOptions.find((item) => item.id === scopeId)
  const areaLabel = area === 'branch' ? 'Quản lý chi nhánh' : 'Quản trị toàn chuỗi'

  return (
    <div className="admin-shell">
      {mobileOpen && (
        <button type="button" className="admin-shell-backdrop" aria-label="Đóng menu điều hướng" onClick={() => setMobileOpen(false)} />
      )}
      <aside className={'admin-shell-sidebar' + (mobileOpen ? ' is-open' : '')} aria-label="Điều hướng quản trị">
        <Link className="admin-shell-brand" to="/" onClick={() => setMobileOpen(false)}>
          <span className="admin-shell-brand-mark">D</span>
          <span className="admin-shell-brand-copy"><strong>DentaVie</strong><small>Clinic Workspace</small></span>
        </Link>
        <div className="admin-shell-workspace">
          <span className="admin-shell-workspace-label">KHÔNG GIAN LÀM VIỆC</span>
          <strong>{areaLabel}</strong>
          <small>{scope?.name || 'Chọn phạm vi quản lý'}</small>
        </div>
        <nav className="admin-shell-nav" aria-label={areaLabel}>
          <span className="admin-shell-nav-caption">QUẢN TRỊ</span>
          {menu.map((item) => (
            <NavLink
              key={item.path}
              end
              to={item.path + suffix}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => 'admin-shell-nav-item' + (isActive ? ' is-active' : '')}
              title={item.description}
            >
              <AdminIcon name={item.icon} />
              <span>{item.title}</span>
              <AdminIcon name="chevron" size={15} />
            </NavLink>
          ))}
        </nav>
        <div className="admin-shell-sidebar-bottom">
          {area === 'organization' || showOrganizationLink ? (
            <Link to={area === 'branch' ? '/quan-ly-to-chuc' : '/quan-ly-chi-nhanh'} className="admin-shell-switch" onClick={() => setMobileOpen(false)}>
              <AdminIcon name={area === 'branch' ? 'building' : 'calendar'} size={18} />
              <span>{area === 'branch' ? 'Quản trị toàn chuỗi' : 'Điều hành chi nhánh'}</span>
              <AdminIcon name="chevron" size={14} />
            </Link>
          ) : null}
          <Link to="/" className="admin-shell-website" onClick={() => setMobileOpen(false)}>
            <AdminIcon name="home" size={18} /> Về website DentaVie
          </Link>
          <div className="admin-shell-version">DentaVie Workspace · v1</div>
        </div>
      </aside>

      <div className="admin-shell-workarea">
        <header className="admin-shell-topbar">
          <div className="admin-shell-topbar-heading">
            <button className="admin-shell-mobile-toggle" type="button" aria-label="Mở menu quản trị" aria-expanded={mobileOpen} onClick={() => setMobileOpen((open) => !open)}>
              <AdminIcon name="menu" size={22} />
            </button>
            <div>
              <div className="admin-shell-breadcrumb">Workspace <span>/</span> {areaLabel}</div>
              <h1>{activeSection?.title || areaLabel}</h1>
            </div>
          </div>
          <div className="admin-shell-topbar-actions">
            {scopeOptions.length > 1 ? (
              <label className="admin-shell-scope">
                <span>{area === 'branch' ? 'Chi nhánh' : 'Tổ chức'}</span>
                <select aria-label={area === 'branch' ? 'Chọn chi nhánh' : 'Chọn tổ chức'} value={scopeId ?? ''} onChange={(event) => onScopeChange(Number(event.target.value))}>
                  {scopeOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
              </label>
            ) : (
              <div className="admin-shell-scope-label">{scope?.name || areaLabel}</div>
            )}
            <div className="admin-shell-account"><AuthBar /></div>
          </div>
        </header>
        <div className="admin-shell-content">
          {scopeError && <div className="admin-shell-alert" role="alert">{scopeError}</div>}
          {scopeLoading ? (
            <div className="admin-shell-state" role="status">Đang tải phạm vi quản lý...</div>
          ) : scopeId ? (
            <Outlet />
          ) : (
            <div className="admin-shell-state" role="status">
              Bạn chưa được phân quyền quản lý một {area === 'branch' ? 'chi nhánh' : 'tổ chức'} đang hoạt động.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function BranchAdminShell() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const managed = useManagedBranches(user)
  const requested = Number(params.get('chi-nhanh')) || null
  const branchId = resolveScopedManagedBranchId({
    isBranchAdmin: managed.isBranchAdmin,
    primaryBranchId: managed.primaryBranchId,
    requestedBranchId: requested,
    branches: managed.branches,
    loaded: !managed.loading,
  })

  useEffect(() => {
    if (!branchId || requested === branchId) return
    const next = new URLSearchParams(params)
    next.set('chi-nhanh', String(branchId))
    setParams(next, { replace: true })
  }, [branchId, requested, params, setParams])

  const options = useMemo(
    () => managed.branches.map((branch) => ({ id: branch.id_branch, name: branch.name })),
    [managed.branches],
  )
  return (
    <AdminFrame
      area="branch"
      menu={branchMenu}
      scopeId={branchId}
      scopeParameter="chi-nhanh"
      scopeOptions={options}
      scopeLoading={managed.loading || Boolean(branchId && requested !== branchId)}
      scopeError={managed.error}
      showOrganizationLink={hasActiveRole(user, ['ORGANIZATION_ADMIN'])}
      onScopeChange={(id) => {
        if (managed.isBranchAdmin) return
        const next = new URLSearchParams(params)
        next.set('chi-nhanh', String(id))
        setParams(next)
      }}
    />
  )
}

function OrganizationAdminShell() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const options = useMemo(() => organizationOptionsForUser(user), [user])
  const requested = Number(params.get('to-chuc')) || null
  const organizationId = resolveOrganizationId(requested, options.map((option) => option.id))

  useEffect(() => {
    if (!organizationId || requested === organizationId) return
    const next = new URLSearchParams(params)
    next.set('to-chuc', String(organizationId))
    setParams(next, { replace: true })
  }, [organizationId, requested, params, setParams])

  return (
    <AdminFrame
      area="organization"
      menu={organizationMenu}
      scopeId={organizationId}
      scopeParameter="to-chuc"
      scopeOptions={options}
      scopeLoading={Boolean(organizationId && requested !== organizationId)}
      onScopeChange={(id) => {
        const next = new URLSearchParams(params)
        next.set('to-chuc', String(id))
        setParams(next)
      }}
    />
  )
}

export function AdminShell({ area }: { area: AdminArea }) {
  return area === 'branch' ? <BranchAdminShell /> : <OrganizationAdminShell />
}
