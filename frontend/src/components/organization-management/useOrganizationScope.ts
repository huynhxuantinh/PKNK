import { useCallback, useMemo } from 'react'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useAuth } from '../../auth/AuthContext'
import {
  organizationOptionsForUser,
  resolveOrganizationId,
} from '../../features/organization/organizationSelection'

export function useOrganizationScope() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const options = useMemo(() => organizationOptionsForUser(user), [user])
  const allowedIds = useMemo(() => options.map((option) => option.id), [options])
  const requestedOrganizationId = Number(params.get('to-chuc')) || null
  const organizationId = resolveOrganizationId(requestedOrganizationId, allowedIds)

  useEffect(() => {
    if (organizationId && requestedOrganizationId !== organizationId) {
      setParams({ 'to-chuc': String(organizationId) }, { replace: true })
    }
  }, [organizationId, requestedOrganizationId, setParams])

  const selectOrganization = useCallback(
    (nextOrganizationId: number) => {
      setParams({ 'to-chuc': String(nextOrganizationId) })
    },
    [setParams],
  )

  return {
    user,
    options,
    organizationId,
    requestedOrganizationId,
    selectOrganization,
  }
}
