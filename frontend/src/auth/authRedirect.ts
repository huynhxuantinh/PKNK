import type { User } from '../types/api'
import { hasActiveRole } from './roles'

export function safeReturnPath(value: string | null | undefined, fallback = '/') {
  if (
    !value
    || !value.startsWith('/')
    || value.startsWith('//')
    || /[\\\u0000-\u001F\u007F-\u009F]/u.test(value)
  ) return fallback
  return value
}

export function destinationAfterLogin(user: User, returnTo?: string | null) {
  const isOrganizationAdmin = hasActiveRole(user, ['ORGANIZATION_ADMIN'])
  const isBranchAdmin = hasActiveRole(user, ['BRANCH_ADMIN'])
  const isDentist = hasActiveRole(user, ['DENTIST'])

  if (isOrganizationAdmin) return '/quan-ly-to-chuc'
  if (isBranchAdmin) return '/quan-ly-chi-nhanh'
  if (isDentist) {
    return '/bac-si/chon-chi-nhanh'
  }

  const destination = safeReturnPath(returnTo)
  return destination === '/bac-si' ? '/' : destination
}
