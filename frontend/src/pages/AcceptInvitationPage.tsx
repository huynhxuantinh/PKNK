import { useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { ApiError, apiRequest } from '../api/client'
import { acceptStaffInvitation, type ManagedMembership } from '../api/management'
import { destinationAfterLogin, safeReturnPath } from '../auth/authRedirect'
import { useAuth } from '../auth/AuthContext'
import type { User } from '../types/api'
import { AuthShell } from './AuthPages'

export function AcceptInvitationPage() {
  const { user, isAuthenticated, isAuthReady, updateUser } = useAuth()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''
  const returnTo = safeReturnPath(`${location.pathname}${location.search}`)
  const encodedReturnTo = encodeURIComponent(returnTo)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [requiresVerification, setRequiresVerification] = useState(false)
  const requestInFlightRef = useRef(false)
  const acceptedMembershipRef = useRef<ManagedMembership | null>(null)

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

  if (!isAuthReady) {
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

  if (!isAuthenticated || !user) {
    return <Navigate to={`/dang-nhap?returnTo=${encodedReturnTo}`} replace />
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
