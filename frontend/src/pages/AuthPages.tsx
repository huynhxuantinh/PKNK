import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { apiRequest } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { destinationAfterLogin } from '../auth/authRedirect'
import { Seo } from '../seo/Seo'

function AuthShell({ children, title, description, seoPath }: { children: ReactNode; title: string; description: string; seoPath: string }) {
  return (
    <>
      <Seo title={`${title} | DentaVie`} description={description} path={seoPath} noIndex />
      <main className="auth-page">
      <section className="auth-page-aside">
        <Link to="/" aria-label="Về trang chủ DentaVie">
          <img src="/branding/dentavie-logo-horizontal-white.png" alt="DentaVie" />
        </Link>
        <div>
          <span>Chăm sóc răng miệng liền mạch</span>
          <h1>Một tài khoản,<br />mọi thông tin cần thiết.</h1>
          <p>Theo dõi hồ sơ khám, ghi chú của bác sĩ, đơn thuốc và kế hoạch điều trị trên hệ thống DentaVie.</p>
        </div>
        <small>Thông tin sức khỏe của bạn được bảo vệ và chỉ hiển thị cho người có quyền truy cập.</small>
      </section>
      <section className="auth-page-content">
        <div className="auth-page-card">
          <Link className="auth-back-link" to="/">← Về trang chủ</Link>
          <div className="auth-page-heading">
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          {children}
        </div>
      </section>
      </main>
    </>
  )
}

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')
    try {
      const user = await login(email, password)
      navigate(destinationAfterLogin(user, searchParams.get('returnTo')), { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể đăng nhập.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell title="Chào mừng trở lại" description="Đăng nhập để xem hồ sơ và lịch sử chăm sóc của bạn." seoPath="/dang-nhap">
      <form className="auth-page-form" onSubmit={handleSubmit}>
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required /></label>
        <label>
          Mật khẩu
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Nhập mật khẩu" required />
        </label>
        <div className="auth-password-actions">
          <Link to="/quen-mat-khau">Quên mật khẩu?</Link>
        </div>
        {error && <p className="auth-page-error">{error}</p>}
        <button className="auth-submit" disabled={isSubmitting}>{isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      </form>
      <p className="auth-switch">Chưa có tài khoản? <Link to="/dang-ky">Đăng ký ngay</Link></p>
    </AuthShell>
  )
}

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [consented, setConsented] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')
    try {
      if (!consented) throw new Error('Bạn cần đồng ý xử lý dữ liệu cá nhân.')
      await register({ fullName, phone, email, password, passwordConfirm })
      navigate('/')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể đăng ký.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell title="Tạo tài khoản" description="Đăng ký tài khoản bệnh nhân DentaVie bằng email của bạn." seoPath="/dang-ky">
      <form className="auth-page-form" onSubmit={handleSubmit}>
        <label>Họ và tên<input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" placeholder="Nguyễn Văn A" required /></label>
        <label>Số điện thoại<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value.replace(/[\s-]/g, ''))} autoComplete="tel" inputMode="tel" pattern="\+?[0-9]{9,15}" placeholder="090 123 4567" required /></label>
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required /></label>
        <div className="auth-form-row">
          <label>Mật khẩu<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="Tạo mật khẩu" required /></label>
          <label>Xác nhận mật khẩu<input type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" placeholder="Nhập lại mật khẩu" required /></label>
        </div>
        <small className="password-hint">Mật khẩu không được quá giống thông tin cá nhân và không được quá phổ biến.</small>
        <label className="auth-consent"><input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} required /><span>Tôi đồng ý để DentaVie xử lý dữ liệu cá nhân phục vụ chăm sóc sức khỏe.</span></label>
        {error && <p className="auth-page-error">{error}</p>}
        <button className="auth-submit" disabled={isSubmitting}>{isSubmitting ? 'Đang tạo tài khoản…' : 'Đăng ký'}</button>
      </form>
      <p className="auth-switch">Đã có tài khoản? <Link to="/dang-nhap">Đăng nhập</Link></p>
    </AuthShell>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')
    try {
      const response = await apiRequest<{ data: { message: string } }>('/auth/password-reset/request/', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      setMessage(response.data.message)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể gửi yêu cầu.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell title="Quên mật khẩu?" description="Nhập email đã đăng ký để nhận liên kết đặt lại mật khẩu." seoPath="/quen-mat-khau">
      {message ? (
        <div className="auth-page-success"><span>✓</span><strong>Kiểm tra hộp thư của bạn</strong><p>{message}</p><Link to="/dang-nhap">Quay lại đăng nhập</Link></div>
      ) : (
        <>
          <form className="auth-page-form" onSubmit={handleSubmit}>
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required /></label>
            {error && <p className="auth-page-error">{error}</p>}
            <button className="auth-submit" disabled={isSubmitting}>{isSubmitting ? 'Đang gửi…' : 'Gửi liên kết đặt lại'}</button>
          </form>
          <p className="auth-switch"><Link to="/dang-nhap">← Quay lại đăng nhập</Link></p>
        </>
      )}
    </AuthShell>
  )
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(token ? '' : 'Liên kết đặt lại mật khẩu không hợp lệ.')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    setIsSubmitting(true)
    setError('')
    try {
      const response = await apiRequest<{ data: { message: string } }>('/auth/password-reset/confirm/', {
        method: 'POST',
        body: JSON.stringify({ token, new_password: password, new_password_confirm: passwordConfirm }),
      })
      setMessage(response.data.message)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể đặt lại mật khẩu.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell title="Đặt lại mật khẩu" description="Tạo mật khẩu mới cho tài khoản DentaVie của bạn." seoPath="/reset-password">
      {message ? (
        <div className="auth-page-success"><span>✓</span><strong>Đã đổi mật khẩu</strong><p>{message}</p><Link to="/dang-nhap">Đăng nhập ngay</Link></div>
      ) : (
        <form className="auth-page-form" onSubmit={handleSubmit}>
          <label>Mật khẩu mới<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="Tạo mật khẩu mới" required /></label>
          <label>Xác nhận mật khẩu<input type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" placeholder="Nhập lại mật khẩu" required /></label>
          <small className="password-hint">Liên kết chỉ sử dụng được một lần và có thời hạn.</small>
          {error && <p className="auth-page-error">{error}</p>}
          <button className="auth-submit" disabled={isSubmitting || !token}>{isSubmitting ? 'Đang cập nhật…' : 'Đặt lại mật khẩu'}</button>
        </form>
      )}
    </AuthShell>
  )
}
