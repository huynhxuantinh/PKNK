import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from './AuthContext'

export function AuthBar() {
  const { user, logout } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const isDentist = user?.memberships?.some((membership) => membership.role === 'DENTIST')

  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', closeMenu)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeMenu)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  if (user) {
    return (
      <div className="auth-user" ref={menuRef}>
        <button
          className="auth-user-summary"
          type="button"
          aria-expanded={isOpen}
          aria-haspopup="menu"
          onClick={() => setIsOpen((current) => !current)}
        >
          <strong>{user.full_name}</strong>
          <svg className="auth-user-chevron" aria-hidden="true" viewBox="0 0 16 16">
            <path d="m4 6 4 4 4-4" />
          </svg>
        </button>
        {isOpen && (
          <div className="auth-user-menu" role="menu">
            {isDentist && <Link role="menuitem" to="/bac-si/chon-chi-nhanh" onClick={() => setIsOpen(false)}>Khu vực nha sĩ</Link>}
            <Link role="menuitem" to="/lich-hen" onClick={() => setIsOpen(false)}>Lịch đã đặt</Link>
            <Link role="menuitem" to="/lich-su-kham" onClick={() => setIsOpen(false)}>Lịch sử khám</Link>
            <Link role="menuitem" to="/ho-so" onClick={() => setIsOpen(false)}>Hồ sơ</Link>
            <span className="auth-user-menu-divider" aria-hidden="true" />
            <button role="menuitem" type="button" onClick={() => { setIsOpen(false); logout() }}>Đăng xuất</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <nav className="auth-actions" aria-label="Tài khoản">
      <Link className="auth-nav-link" to="/dang-nhap">Đăng nhập</Link>
      <span aria-hidden="true">/</span>
      <Link className="auth-nav-link" to="/dang-ky">Đăng ký</Link>
    </nav>
  )
}
