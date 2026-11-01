import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import {
  listManagedOrganizationBranches,
  type ManagedBranch,
} from '../../api/management'
import type { User } from '../../types/api'
import { resolveScopedManagedBranchId } from './managedBranchSelection'

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
        }))
        .slice(0, 1),
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

  const primaryBranchId = directBranches[0]?.id_branch ?? null
  return {
    branches: branches.filter((branch) => branch.is_active),
    loading,
    error,
    isBranchAdmin: primaryBranchId !== null,
    primaryBranchId,
  }
}

/** Keeps the current branch valid and synchronized in the management URL. */
export function useManagedBranchScope(user: User | null, enabled = true) {
  const managed = useManagedBranches(user)
  const [params, setParams] = useSearchParams()
  const requestedBranchId = Number(params.get('chi-nhanh')) || null
  const branchId = resolveScopedManagedBranchId({
    isBranchAdmin: managed.isBranchAdmin,
    primaryBranchId: managed.primaryBranchId,
    requestedBranchId,
    branches: managed.branches,
    loaded: !managed.loading,
  }) ?? null

  useEffect(() => {
    if (!enabled || !branchId || requestedBranchId === branchId) return
    const next = new URLSearchParams(params)
    next.set('chi-nhanh', String(branchId))
    setParams(next, { replace: true })
  }, [branchId, enabled, params, requestedBranchId, setParams])

  return {
    ...managed,
    branchId,
    requestedBranchId,
    selectBranch(nextBranchId: number) {
      const next = new URLSearchParams(params)
      next.set('chi-nhanh', String(nextBranchId))
      setParams(next)
    },
  }
}
