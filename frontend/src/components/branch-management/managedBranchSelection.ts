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

export function resolveScopedManagedBranchId({
  isBranchAdmin,
  primaryBranchId,
  requestedBranchId,
  branches,
  loaded,
}: {
  isBranchAdmin: boolean
  primaryBranchId: number | null
  requestedBranchId: number | null
  branches: ManagedBranch[]
  loaded: boolean
}) {
  // A branch manager always works in their single assigned branch. Any
  // chi-nhanh query parameter that points elsewhere is ignored.
  if (isBranchAdmin) return primaryBranchId
  return resolveManagedBranchId(requestedBranchId, branches, loaded)
}
