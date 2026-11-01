import { useCallback, useMemo } from 'react'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useAuth } from '../../auth/AuthContext'
import {
  organizationOptionsForUser,
  resolveOrganizationId,
} from '../../features/organization/organizationSelection'

export function useOrganizationScope(enabled = true) {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const options = useMemo(() => organizationOptionsForUser(user), [user])
  const allowedIds = useMemo(() => options.map((option) => option.id), [options])
  const requestedOrganizationId = Number(params.get('to-chuc')) || null
  const organizationId = resolveOrganizationId(requestedOrganizationId, allowedIds)

  useEffect(() => {
    if (enabled && organizationId && requestedOrganizationId !== organizationId) {
      const next = new URLSearchParams(params)
      next.set('to-chuc', String(organizationId))
      setParams(next, { replace: true })
    }
  }, [enabled, organizationId, params, requestedOrganizationId, setParams])

  const selectOrganization = useCallback(
    (nextOrganizationId: number) => {
      const next = new URLSearchParams(params)
      next.set('to-chuc', String(nextOrganizationId))
      setParams(next)
    },
    [params, setParams],
  )

  return {
    user,
    options,
    organizationId,
    requestedOrganizationId,
    selectOrganization,
  }
}
