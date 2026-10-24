import type { ManagedBranch } from '../../api/management'

export function resolveManagedBranchId(
  requestedBranchId: number | null,
  branches: ManagedBranch[],
  loaded: boolean,
) {
  if (!loaded) return null
  const activeBranchIds = branches
    .filter((branch) => branch.is_active)
    .map((branch) => branch.id_branch)

  if (requestedBranchId && activeBranchIds.includes(requestedBranchId)) {
    return requestedBranchId
  }
  return activeBranchIds[0] ?? null
}
