import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { ApiError, apiRequest } from '../api/client'
import {
  acceptNewStaffInvitation,
  acceptStaffInvitation,
  previewStaffInvitation,
  type ManagedMembership,
  type StaffInvitationPreview,
} from '../api/management'
import { destinationAfterLogin, safeReturnPath } from '../auth/authRedirect'
import { useAuth } from '../auth/AuthContext'
import type { User } from '../types/api'
import { AuthShell } from './AuthPages'

const invitationRoleLabels: Record<StaffInvitationPreview['role'], string> = {
  DENTIST: 'Nha sĩ',
  BRANCH_ADMIN: 'Quản lý chi nhánh',
  ORGANIZATION_ADMIN: 'Quản lý toàn chuỗi',
}

function InvitationDetails({ preview }: { preview: StaffInvitationPreview }) {
  const expiresAt = new Date(preview.expires_at).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  return (
    <div className="invitation-details">
      <p><b>Tổ chức:</b> {preview.organization_name}</p>
      <p><b>Vai trò:</b> {invitationRoleLabels[preview.role]}</p>
      <p><b>Chi nhánh:</b> {preview.branch_name || 'Toàn hệ thống'}</p>
      <p><b>Người mời:</b> {preview.invited_by_name}</p>
      <p><b>Hạn chấp nhận:</b> {expiresAt}</p>
    </div>
  )
}

function maskedEmail(email: string) {
  const [localPart, domain = ''] = email.split('@')
  if (!localPart || !domain) return '***'
  return `${localPart.slice(0, 1)}***@${domain}`
}

export function AcceptInvitationPage() {
  const { user, isAuthenticated, isAuthReady, logout, startSession, updateUser } = useAuth()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''
  const returnTo = safeReturnPath(`${location.pathname}${location.search}`)
  const encodedReturnTo = encodeURIComponent(returnTo)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState('')
  const [requiresVerification, setRequiresVerification] = useState(false)
  const [preview, setPreview] = useState<StaffInvitationPreview | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(true)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const requestInFlightRef = useRef(false)
  const acceptedMembershipRef = useRef<ManagedMembership | null>(null)

  useEffect(() => {
    if (!isAuthReady || !token) {
      setIsPreviewLoading(false)
      return
    }
    let active = true
    setIsPreviewLoading(true)
    void previewStaffInvitation(token)
      .then((response) => {
        if (active) setPreview(response.data)
      })
      .catch((reason) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'Không thể kiểm tra lời mời.')
      })
      .finally(() => {
        if (active) setIsPreviewLoading(false)
      })
    return () => { active = false }
  }, [isAuthReady, token])

  async function acceptAsNewAccount(event: FormEvent) {
    event.preventDefault()
    if (requestInFlightRef.current) return
    setError('')
    if (password !== passwordConfirmation) {
      setError('Mật khẩu xác nhận không khớp.')
      return
    }
    requestInFlightRef.current = true
    setIsSubmitting(true)
    try {
      const response = await acceptNewStaffInvitation({
        token,
        full_name: fullName.trim(),
        phone,
        password,
      })
      startSession?.(response.data.user, response.data.tokens)
      navigate(destinationAfterLogin(response.data.user), { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tạo tài khoản và nhận lời mời.')
    } finally {
      requestInFlightRef.current = false
      setIsSubmitting(false)
    }
  }

  async function switchAccount() {
    if (isSigningOut) return
    setIsSigningOut(true)
    await logout()
    navigate(`/dang-nhap?returnTo=${encodedReturnTo}`, { replace: true })
  }

  async function acceptInvitation() {
    if (!token || requestInFlightRef.current) return
    requestInFlightRef.current = true
    setIsSubmitting(true)
    setError('')
    setRequiresVerification(false)
    try {
      if (!acceptedMembershipRef.current) {
        const accepted = await acceptStaffInvitation(token)
        acceptedMembershipRef.current = accepted.data
      }
      const refreshed = await apiRequest<{ data: User }>('/auth/me/', {}, { auth: true })
      updateUser(refreshed.data)
      navigate(destinationAfterLogin(refreshed.data), { replace: true })
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 400) {
        setError('Lời mời không hợp lệ, đã dùng hoặc đã hết hạn. Hãy nhờ quản trị viên gửi lại.')
      } else if (reason instanceof ApiError && reason.status === 403) {
        setRequiresVerification(true)
        setError('Bạn cần xác minh email trước khi nhận lời mời.')
      } else {
        setError(reason instanceof Error ? reason.message : 'Không thể nhận lời mời. Vui lòng thử lại.')
      }
    } finally {
      requestInFlightRef.current = false
      setIsSubmitting(false)
    }
  }

  if (!isAuthReady || isPreviewLoading) {
    return (
      <AuthShell title="Lời mời làm việc" description="Xác nhận lời mời để tham gia đội ngũ DentaVie." seoPath="/accept-invitation">
        <div className="invitation-state" aria-live="polite">
          <span className="invitation-loader" aria-hidden="true" />
          <p>Đang kiểm tra tài khoản…</p>
        </div>
      </AuthShell>
    )
  }

  if (!token) {
    return (
      <AuthShell title="Lời mời làm việc" description="Xác nhận lời mời để tham gia đội ngũ DentaVie." seoPath="/accept-invitation">
        <div className="auth-page-error" role="alert">
          Liên kết lời mời không hợp lệ hoặc thiếu mã xác nhận.
        </div>
      </AuthShell>
    )
  }

  if (!preview) {
    return (
      <AuthShell title="Lời mời không hợp lệ" description="Không thể tiếp tục nhận lời mời." seoPath="/accept-invitation">
        <p className="auth-page-error" role="alert">{error || 'Lời mời không hợp lệ, đã dùng hoặc đã hết hạn.'}</p>
      </AuthShell>
    )
  }

  if (!isAuthenticated && preview?.has_account) {
    return <Navigate to={`/dang-nhap?returnTo=${encodedReturnTo}`} replace />
  }

  if (!isAuthenticated && preview) {
    return (
      <AuthShell
        title="Tạo tài khoản nhân viên"
        description={`Nhận lời mời tham gia ${preview.organization_name} trong một bước.`}
        seoPath="/accept-invitation"
      >
        <div className="invitation-panel">
          <div>
            <strong>{preview.email}</strong>
            <p>Email trong lời mời sẽ được xác minh tự động.</p>
          </div>
          <InvitationDetails preview={preview} />
          <form className="auth-page-form" onSubmit={acceptAsNewAccount}>
            <label>
              Họ và tên
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required />
            </label>
            <label>
              Số điện thoại
              <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value.replace(/[\s-]/g, ''))} autoComplete="tel" inputMode="tel" pattern="\+?[0-9]{9,15}" required />
            </label>
            <label>
              Mật khẩu
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
            </label>
            <label>
              Xác nhận mật khẩu
              <input type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" minLength={8} required />
            </label>
            {error && <p className="auth-page-error" role="alert">{error}</p>}
            <button className="auth-submit" disabled={isSubmitting}>
              {isSubmitting ? 'Đang tạo tài khoản…' : 'Tạo tài khoản và nhận lời mời'}
            </button>
          </form>
        </div>
      </AuthShell>
    )
  }

  if (
    isAuthenticated
    && user
    && user.email.toLowerCase() !== preview.email.toLowerCase()
  ) {
    return (
      <AuthShell
        title="Bạn đang dùng sai tài khoản"
        description="Đăng nhập đúng email để nhận lời mời làm việc."
        seoPath="/accept-invitation"
      >
        <div className="invitation-panel">
          <InvitationDetails preview={preview} />
          <p className="auth-page-error" role="alert">
            Lời mời này gửi cho {maskedEmail(preview.email)}, nhưng bạn đang đăng nhập bằng email khác.
          </p>
          <button
            className="auth-submit"
            type="button"
            onClick={switchAccount}
            disabled={isSigningOut}
          >
            {isSigningOut ? 'Đang đăng xuất…' : 'Đăng xuất và đổi tài khoản'}
          </button>
        </div>
      </AuthShell>
    )
  }

  if (!isAuthenticated || !user) {
    return (
      <AuthShell title="Lời mời không hợp lệ" description="Không thể tiếp tục nhận lời mời." seoPath="/accept-invitation">
        <p className="auth-page-error" role="alert">{error || 'Lời mời không hợp lệ, đã dùng hoặc đã hết hạn.'}</p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Lời mời làm việc"
      description="Xác nhận lời mời để tham gia đội ngũ DentaVie."
      seoPath="/accept-invitation"
    >
      {!user.email_verified ? (
        <div className="invitation-panel">
          <div className="invitation-mark" aria-hidden="true">02</div>
          <div>
            <strong>Cần xác minh email</strong>
            <p>Xác minh email {user.email} trước khi nhận lời mời làm việc.</p>
          </div>
          <Link
            className="invitation-primary-link"
            to={`/xac-minh-email?email=${encodeURIComponent(user.email)}&returnTo=${encodedReturnTo}`}
          >
            Xác minh email
          </Link>
        </div>
      ) : (
        <div className="invitation-panel">
          <div className="invitation-mark" aria-hidden="true">03</div>
          <div>
            <strong>Sẵn sàng tham gia</strong>
            <p>Bạn đang nhận lời mời bằng tài khoản <b>{user.email}</b>.</p>
            <p className="invitation-warning">Khi chấp nhận, vai trò bệnh nhân hiện tại sẽ được tắt.</p>
          </div>
          <InvitationDetails preview={preview} />
          {error && <p className="auth-page-error" role="alert">{error}</p>}
          {requiresVerification && (
            <Link
              className="invitation-secondary-link"
              to={`/xac-minh-email?email=${encodeURIComponent(user.email)}&returnTo=${encodedReturnTo}`}
            >
              Đi tới xác minh email
            </Link>
          )}
          <button
            className="auth-submit"
            type="button"
            onClick={acceptInvitation}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Đang xác nhận…' : 'Chấp nhận lời mời'}
          </button>
        </div>
      )}
    </AuthShell>
  )
}
