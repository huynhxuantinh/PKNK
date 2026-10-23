import type { User } from '../types/api'
import { hasActiveRole } from './roles'

export function safeReturnPath(value: string | null | undefined, fallback = '/') {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback
  return value
}

export function destinationAfterLogin(user: User, returnTo?: string | null) {
  const isBranchAdmin = hasActiveRole(user, ['BRANCH_ADMIN', 'ORGANIZATION_ADMIN'])
  const isDentist = hasActiveRole(user, ['DENTIST'])

  if (isBranchAdmin) return '/quan-ly-chi-nhanh'
  if (isDentist) {
    return '/bac-si/chon-chi-nhanh'
  }

  const destination = safeReturnPath(returnTo)
  return destination === '/bac-si' ? '/' : destination
}
