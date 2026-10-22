import type { User } from '../types/api'

export function safeReturnPath(value: string | null | undefined, fallback = '/') {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback
  return value
}

export function destinationAfterLogin(user: User, returnTo?: string | null) {
  const isDentist = user.memberships?.some((membership) => membership.role === 'DENTIST')

  if (isDentist) {
    return '/bac-si/chon-chi-nhanh'
  }

  const destination = safeReturnPath(returnTo)
  return destination === '/bac-si' ? '/' : destination
}
