import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from './AuthContext'
import { destinationAfterLogin } from './authRedirect'
import { canAccessArea, type ProtectedArea } from './roles'

export function RequireRole({ area }: { area: ProtectedArea }) {
  const { user, isAuthenticated, isAuthReady } = useAuth()
  const location = useLocation()

  if (!isAuthReady) {
    return <div className="route-auth-loading" role="status">Đang kiểm tra phiên đăng nhập…</div>
  }

  if (!isAuthenticated || !user) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={`/dang-nhap?returnTo=${encodeURIComponent(returnTo)}`} replace />
  }

  if (!canAccessArea(user, area)) {
    return <Navigate to={destinationAfterLogin(user)} replace />
  }

  return <Outlet />
}
