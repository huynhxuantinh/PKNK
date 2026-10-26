import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'

import { apiRequest } from '../api/client'
import { acceptStaffInvitation, type ManagedMembership } from '../api/management'
import { destinationAfterLogin } from '../auth/authRedirect'
import { useAuth } from '../auth/AuthContext'
import type { User } from '../types/api'
import { AuthShell } from './AuthPages'

const roleLabels: Record<ManagedMembership['role'], string> = {
  DENTIST: 'Nha sĩ',
  BRANCH_ADMIN: 'Quản lý chi nhánh',
  ORGANIZATION_ADMIN: 'Quản trị hệ thống',
}

export function StaffInvitationPage() {
  const { user, isAuthenticated, isAuthReady, updateUser } = useAuth()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const token = searchParams.get('token') || ''
  const returnTo = `${location.pathname}${location.search}`
  const encodedReturnTo = encodeURIComponent(returnTo)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [acceptedRole, setAcceptedRole] = useState('')
  const [destination, setDestination] = useState('/')

  async function acceptInvitation() {
    if (!token || isSubmitting) return
    setIsSubmitting(true)
    setError('')
    try {
      const accepted = await acceptStaffInvitation(token)
      const refreshed = await apiRequest<{ data: User }>('/auth/me/', {}, { auth: true })
      updateUser(refreshed.data)
      setAcceptedRole(roleLabels[accepted.data.role])
      setDestination(destinationAfterLogin(refreshed.data))
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Không thể nhận lời mời. Vui lòng thử lại.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Lời mời làm việc"
      description="Xác nhận lời mời để tham gia đội ngũ DentaVie."
      seoPath="/accept-invitation"
    >
      {!isAuthReady ? (
        <div className="invitation-state" aria-live="polite">
          <span className="invitation-loader" aria-hidden="true" />
          <p>Đang kiểm tra tài khoản…</p>
        </div>
      ) : !token ? (
        <div className="auth-page-error" role="alert">
          Liên kết lời mời không hợp lệ hoặc thiếu mã xác nhận.
        </div>
      ) : acceptedRole ? (
        <div className="auth-page-success">
          <span>✓</span>
          <div className="invitation-success">
            <strong>Đã nhận lời mời</strong>
            <p>Bạn đã được cấp vai trò {acceptedRole}.</p>
          </div>
          <Link className="invitation-primary-link" to={destination}>
            Đi tới khu vực làm việc
          </Link>
        </div>
      ) : !isAuthenticated || !user ? (
        <div className="invitation-panel">
          <div className="invitation-mark" aria-hidden="true">01</div>
          <div>
            <strong>Đăng nhập để tiếp tục</strong>
            <p>Dùng đúng email đã nhận lời mời. Mã mời sẽ được giữ lại sau khi đăng nhập.</p>
          </div>
          <div className="invitation-actions">
            <Link className="invitation-primary-link" to={`/dang-nhap?returnTo=${encodedReturnTo}`}>
              Đăng nhập
            </Link>
            <Link className="invitation-secondary-link" to={`/dang-ky?returnTo=${encodedReturnTo}`}>
              Tạo tài khoản
            </Link>
          </div>
        </div>
      ) : !user.email_verified ? (
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
          </div>
          {error && <p className="auth-page-error" role="alert">{error}</p>}
          <button
            className="auth-submit"
            type="button"
            onClick={acceptInvitation}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Đang xác nhận…' : 'Nhận lời mời'}
          </button>
        </div>
      )}
    </AuthShell>
  )
}
