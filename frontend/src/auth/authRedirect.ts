import type { User } from '../types/api'
import { hasActiveRole } from './roles'

function hasUnsafeReturnPathCharacter(value: string) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return character === '\\' || code <= 0x1f || (code >= 0x7f && code <= 0x9f)
  })
}

export function safeReturnPath(value: string | null | undefined, fallback = '/') {
  if (
    !value
    || !value.startsWith('/')
    || value.startsWith('//')
    || hasUnsafeReturnPathCharacter(value)
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
