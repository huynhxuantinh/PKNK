import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import { AuthBar } from '../../auth/AuthBar'
import { canSwitchAdminArea } from '../../auth/roles'
import { useAuth } from '../../auth/AuthContext'
import { Seo } from '../../seo/Seo'
import { useManagedBranchScope } from '../branch-management/useManagedBranches'
import { useOrganizationScope } from '../organization-management/useOrganizationScope'
import { AdminNotificationMenu } from './AdminNotificationMenu'
import {
  ADMIN_BRANCH_NOTIFICATIONS_PATH,
  ADMIN_ORGANIZATION_NOTIFICATIONS_PATH,
} from '../../notifications/adminNotificationNavigation'
import './admin-shell.css'
import { AdminToastProvider } from './ui'

type NavigationIcon = 'overview' | 'calendar' | 'schedule' | 'reports' | 'invoice' | 'settings' | 'branches' | 'staff' | 'services' | 'audit' | 'notifications'
type NavigationItem = { label: string; path: string; icon: NavigationIcon }

const branchItems: NavigationItem[] = [
  { label: 'Tổng quan', path: '/quan-ly-chi-nhanh', icon: 'overview' },
  { label: 'Lịch hẹn', path: '/quan-ly-chi-nhanh/lich-hen', icon: 'calendar' },
  { label: 'Ca làm & nghỉ phép', path: '/quan-ly-chi-nhanh/ca-lam', icon: 'schedule' },
  { label: 'Báo cáo', path: '/quan-ly-chi-nhanh/bao-cao', icon: 'reports' },
  { label: 'Hóa đơn', path: '/quan-ly-chi-nhanh/hoa-don', icon: 'invoice' },
  { label: 'Thông báo', path: ADMIN_BRANCH_NOTIFICATIONS_PATH, icon: 'notifications' },
  { label: 'Cấu hình', path: '/quan-ly-chi-nhanh/cau-hinh', icon: 'settings' },
]

const organizationItems: NavigationItem[] = [
  { label: 'Tổng quan', path: '/quan-ly-to-chuc', icon: 'overview' },
  { label: 'Lịch hẹn', path: '/quan-ly-to-chuc/lich-hen', icon: 'calendar' },
  { label: 'Ca làm & nghỉ', path: '/quan-ly-to-chuc/ca-lam', icon: 'schedule' },
  { label: 'Tài chính', path: '/quan-ly-to-chuc/tai-chinh', icon: 'invoice' },
  { label: 'Báo cáo', path: '/quan-ly-to-chuc/bao-cao', icon: 'reports' },
  { label: 'Chi nhánh', path: '/quan-ly-to-chuc/chi-nhanh', icon: 'branches' },
  { label: 'Nhân sự', path: '/quan-ly-to-chuc/nhan-su', icon: 'staff' },
  { label: 'Dịch vụ', path: '/quan-ly-to-chuc/dich-vu', icon: 'services' },
  { label: 'Nhật ký', path: '/quan-ly-to-chuc/nhat-ky', icon: 'audit' },
  { label: 'Thông báo', path: ADMIN_ORGANIZATION_NOTIFICATIONS_PATH, icon: 'notifications' },
  { label: 'Cấu hình', path: '/quan-ly-to-chuc/cau-hinh', icon: 'settings' },
]

function SidebarIcon({ name }: { name: NavigationIcon }) {
  const paths: Record<NavigationIcon, ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /></>,
    schedule: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></>,
    reports: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    invoice: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56v.08h-3v-.08A1.7 1.7 0 0 0 10.68 18.66a1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7.02 15 1.7 1.7 0 0 0 5.46 14H5.4v-3h.06A1.7 1.7 0 0 0 7.02 9.97a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.56v-.08h3v.08a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.94 11H21v3h-.06A1.7 1.7 0 0 0 19.4 15Z" /></>,
    branches: <><path d="M4 21V5h11v16M15 10h5v11M8 9h3M8 13h3M8 17h3" /></>,
    staff: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.6-6 6-6s6 2.7 6 6M16 5.5a3 3 0 0 1 0 5M17 14c2.4.4 4 2.5 4 5" /></>,
    services: <><path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5" /></>,
    audit: <><path d="M5 3h11l3 3v15H5zM16 3v4h4M8 11h8M8 15h6" /></>,
    notifications: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  }
  return <svg className="admin-nav-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function sectionTitle(pathname: string) {
  const item = [...branchItems, ...organizationItems].find((candidate) => candidate.path === pathname)
  return item?.label || 'Vận hành'
}

export function AdminShell() {
  const { user } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [sidebarCompact, setSidebarCompact] = useState(false)
  const [isMobileSidebar, setIsMobileSidebar] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const menuToggleRef = useRef<HTMLButtonElement>(null)
  const restoreFocusOnClose = useRef(false)
  const organizationArea = location.pathname.startsWith('/quan-ly-to-chuc')
  const items = organizationArea ? organizationItems : branchItems
  const branchScope = useManagedBranchScope(user, !organizationArea)
  const organizationScope = useOrganizationScope(organizationArea)
  const query = organizationArea ? organizationScope.organizationId : branchScope.branchId
  const queryName = organizationArea ? 'to-chuc' : 'chi-nhanh'
  const canSwitchArea = canSwitchAdminArea(user)
  const scopeOptions = organizationArea ? organizationScope.options : branchScope.branches
  const scopeDisabled = organizationArea ? !organizationScope.options.length : branchScope.loading || !branchScope.branches.length

  function closeMenu(restoreFocus = false) {
    restoreFocusOnClose.current = restoreFocus
    setMenuOpen(false)
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px)')
    const updateViewport = () => {
      setIsMobileSidebar(mediaQuery.matches)
      if (!mediaQuery.matches) closeMenu(false)
    }
    updateViewport()
    mediaQuery.addEventListener('change', updateViewport)
    return () => mediaQuery.removeEventListener('change', updateViewport)
  }, [])

  useEffect(() => {
    sidebarRef.current?.toggleAttribute('inert', isMobileSidebar && !menuOpen)
  }, [isMobileSidebar, menuOpen])

  useEffect(() => {
    if (!isMobileSidebar || !menuOpen) {
      if (restoreFocusOnClose.current) {
        restoreFocusOnClose.current = false
        menuToggleRef.current?.focus()
      }
      return
    }

    const sidebar = sidebarRef.current
    sidebar?.focus()
    const focusableSelector = 'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu(true)
        return
      }
      if (event.key !== 'Tab' || !sidebar) return
      const focusable = Array.from(sidebar.querySelectorAll<HTMLElement>(focusableSelector))
      if (!focusable.length) {
        event.preventDefault()
        sidebar.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (
        event.shiftKey &&
        (document.activeElement === sidebar || document.activeElement === first)
      ) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isMobileSidebar, menuOpen])

  function selectScope(id: number) {
    if (organizationArea) organizationScope.selectOrganization(id)
    else branchScope.selectBranch(id)
    closeMenu(false)
  }

  function destination(path: string) {
    return query ? `${path}?${queryName}=${query}` : path
  }

  return (
    <div className={`admin-shell ${sidebarCompact ? 'is-sidebar-compact' : ''}`}>
      <Seo title={`${sectionTitle(location.pathname)} | DentaVie`} description="Khu vực vận hành DentaVie." path={location.pathname} noIndex />
      <aside
        ref={sidebarRef}
        className={`admin-sidebar ${menuOpen ? 'is-open' : ''}`}
        aria-label="Điều hướng quản trị"
        aria-hidden={isMobileSidebar && !menuOpen}
        tabIndex={-1}
      >
        <div className="admin-sidebar-brand-row">
          <Link
            className="admin-brand"
            to="/"
            onClick={(event) => {
              event.preventDefault()
              setSidebarCompact((compact) => !compact)
            }}
            aria-label={sidebarCompact ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
          >
            <img className="admin-brand-wordmark" src="/branding/dentavie-logo-horizontal-color.png" alt="DentaVie" />
            <img className="admin-brand-symbol" src="/branding/dentavie-symbol-color-padded.png" alt="DentaVie" />
          </Link>
          {!sidebarCompact && <button
            className="admin-sidebar-collapse"
            type="button"
            onClick={() => setSidebarCompact((compact) => !compact)}
            aria-label="Thu gọn thanh điều hướng"
          >«</button>}
        </div>
        <p className="admin-sidebar-kicker">{organizationArea ? 'Quản trị chuỗi' : 'Vận hành chi nhánh'}</p>
        <p className="admin-sidebar-group-label">Điều hướng</p>
        <nav className="admin-sidebar-nav">
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={destination(item.path)}
              end
              onClick={() => closeMenu(false)}
            >
              <span aria-hidden="true"><SidebarIcon name={item.icon} /></span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <label className="admin-mobile-scope-picker">
          <span>{organizationArea ? 'Tổ chức đang quản lý' : 'Chi nhánh đang quản lý'}</span>
          <select
            value={query || ''}
            disabled={scopeDisabled}
            onChange={(event) => selectScope(Number(event.target.value))}
          >
            {scopeOptions.map((scope) => {
              const id = 'id' in scope ? scope.id : scope.id_branch
              return <option key={id} value={id}>{scope.name}</option>
            })}
          </select>
        </label>
        {canSwitchArea && (
          <Link
            className="admin-area-switch"
            to={organizationArea ? '/quan-ly-chi-nhanh' : '/quan-ly-to-chuc'}
            onClick={() => closeMenu(false)}
          >
            {organizationArea ? 'Quản lý chi nhánh' : 'Quản trị tổ chức'}
          </Link>
        )}
      </aside>
      {menuOpen && <button className="admin-sidebar-backdrop" type="button" aria-label="Đóng menu" onClick={() => closeMenu(true)} />}
      <div className="admin-workspace">
        <header className="admin-topbar">
          <button
            ref={menuToggleRef}
            className="admin-menu-toggle"
            type="button"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Đóng menu quản trị' : 'Mở menu quản trị'}
            onClick={() => {
              restoreFocusOnClose.current = false
              setMenuOpen((open) => !open)
            }}
          >☰</button>
          <div className="admin-breadcrumb" aria-label="Đường dẫn">
            <span>{organizationArea ? 'Quản trị tổ chức' : 'Quản lý chi nhánh'}</span>
            <b>/</b>
            <strong>{sectionTitle(location.pathname)}</strong>
          </div>
          <label className="admin-scope-picker">
            <span>{organizationArea ? 'Tổ chức' : 'Chi nhánh'}</span>
            <select
              value={query || ''}
              disabled={scopeDisabled}
              onChange={(event) => selectScope(Number(event.target.value))}
            >
              {scopeOptions.map((scope) => {
                const id = 'id' in scope ? scope.id : scope.id_branch
                return <option key={id} value={id}>{scope.name}</option>
              })}
            </select>
          </label>
          <AdminNotificationMenu />
          <AuthBar />
        </header>
        <AdminToastProvider><div className="admin-shell-content"><Outlet /></div></AdminToastProvider>
      </div>
    </div>
  )
}
