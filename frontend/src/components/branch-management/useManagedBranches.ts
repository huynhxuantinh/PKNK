import { useEffect, useMemo, useState } from 'react'

import {
  listManagedOrganizationBranches,
  type ManagedBranch,
} from '../../api/management'
import type { User } from '../../types/api'

export function useManagedBranches(user: User | null) {
  const directBranches = useMemo<ManagedBranch[]>(
    () =>
      (user?.memberships || [])
        .filter(
          (membership) =>
            membership.is_active &&
            membership.role === 'BRANCH_ADMIN' &&
            membership.branch_id,
        )
        .map((membership) => ({
          id_branch: membership.branch_id as number,
          name: membership.branch_name || `Chi nhánh #${membership.branch_id}`,
          is_active: true,
        })),
    [user],
  )
  const organizationIds = useMemo(
    () => [
      ...new Set(
        (user?.memberships || [])
          .filter(
            (membership) =>
              membership.is_active && membership.role === 'ORGANIZATION_ADMIN',
          )
          .map((membership) => membership.organization_id),
      ),
    ],
    [user],
  )
  const [branches, setBranches] = useState<ManagedBranch[]>(directBranches)
  const [loading, setLoading] = useState(organizationIds.length > 0)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(organizationIds.length > 0)
    setError('')

    Promise.all(organizationIds.map(listManagedOrganizationBranches))
      .then((responses) => {
        if (!active) return
        const available = [
          ...directBranches,
          ...responses.flatMap((response) => response.data),
        ]
        setBranches([
          ...new Map(available.map((branch) => [branch.id_branch, branch])).values(),
        ])
      })
      .catch((caught) => {
        if (!active) return
        setBranches(directBranches)
        setError(caught instanceof Error ? caught.message : 'Không thể tải chi nhánh.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [directBranches, organizationIds])

  return {
    branches: branches.filter((branch) => branch.is_active),
    loading,
    error,
  }
}
