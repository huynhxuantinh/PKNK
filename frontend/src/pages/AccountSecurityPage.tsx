import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { apiRequest } from '../api/client'
import { AuthBar } from '../auth/AuthBar'
import { useAuth } from '../auth/AuthContext'
import { Seo } from '../seo/Seo'

export function AccountSecurityPage() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (newPassword !== newPasswordConfirm) {
      setError('Mật khẩu xác nhận không khớp.')
      return
    }
    if (currentPassword === newPassword) {
      setError('Mật khẩu mới phải khác mật khẩu hiện tại.')
      return
    }
    setBusy(true)
    try {
      await apiRequest<{ data: { message: string } }>('/auth/password/change/', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          new_password_confirm: newPasswordConfirm,
        }),
      }, { auth: true })
      await logout()
      navigate('/dang-nhap?passwordChanged=1', { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể đổi mật khẩu.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="site-shell security-page">
      <Seo title="Đổi mật khẩu | DentaVie" description="Cập nhật mật khẩu tài khoản DentaVie." path="/doi-mat-khau" noIndex />
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Trang chủ DentaVie"><img src="/branding/dentavie-logo-horizontal-color.png" alt="DentaVie" /></Link>
        <nav className="main-nav" aria-label="Điều hướng chính"><Link to="/">Trang chủ</Link><Link to="/chinh-sach-bao-mat">Bảo mật</Link></nav>
        <AuthBar />
      </header>
      <main className="security-main">
        <section className="security-card">
          <div className="security-card-intro">
            <span aria-hidden="true">•••</span>
            <p className="eyebrow">Bảo mật tài khoản</p>
            <h1>Đổi mật khẩu</h1>
            <p>Bạn sẽ được đăng xuất sau khi đổi mật khẩu. Các phiên khác sẽ không thể tiếp tục gia hạn.</p>
          </div>
          <form className="security-form" onSubmit={submit}>
            <label>Mật khẩu hiện tại<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
            <label>Mật khẩu mới<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
            <label>Xác nhận mật khẩu mới<input type="password" autoComplete="new-password" value={newPasswordConfirm} onChange={(event) => setNewPasswordConfirm(event.target.value)} required /></label>
            <small>Mật khẩu nên dài, khó đoán và không trùng thông tin cá nhân.</small>
            {error && <p className="auth-page-error" role="alert">{error}</p>}
            <div className="security-actions"><button type="submit" disabled={busy}>{busy ? 'Đang cập nhật…' : 'Đổi mật khẩu'}</button><Link to="/">Hủy</Link></div>
          </form>
        </section>
      </main>
    </div>
  )
}
