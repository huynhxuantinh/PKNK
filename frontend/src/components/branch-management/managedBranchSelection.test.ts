import { describe, expect, it } from 'vitest'

import {
  resolveManagedBranchId,
  resolveScopedManagedBranchId,
} from './managedBranchSelection'

const branches = [
  { id_branch: 2, name: 'Chi nhánh 2', is_active: true },
  { id_branch: 5, name: 'Chi nhánh 5', is_active: true },
  { id_branch: 8, name: 'Chi nhánh 8', is_active: false },
]

describe('managed branch selection', () => {
  it('waits for the complete branch scope before normalizing the URL', () => {
    expect(resolveManagedBranchId(5, branches.slice(0, 1), false)).toBeNull()
  })

  it('keeps a valid active branch requested in the URL', () => {
    expect(resolveManagedBranchId(5, branches, true)).toBe(5)
  })

  it('falls back to the first active branch for an invalid or inactive id', () => {
    expect(resolveManagedBranchId(999, branches, true)).toBe(2)
    expect(resolveManagedBranchId(8, branches, true)).toBe(2)
  })

  it('always keeps a branch admin in their single assigned branch', () => {
    expect(
      resolveScopedManagedBranchId({
        isBranchAdmin: true,
        primaryBranchId: 2,
        requestedBranchId: 5,
        branches: [branches[0]],
        loaded: false,
      }),
    ).toBe(2)
  })

  it('ignores a foreign chi-nhanh parameter for branch admins', () => {
    expect(
      resolveScopedManagedBranchId({
        isBranchAdmin: true,
        primaryBranchId: 2,
        requestedBranchId: 999,
        branches: branches.slice(0, 1),
        loaded: true,
      }),
    ).toBe(2)
  })

  it('keeps the URL selection behaviour for organization admins', () => {
    expect(
      resolveScopedManagedBranchId({
        isBranchAdmin: false,
        primaryBranchId: null,
        requestedBranchId: 5,
        branches,
        loaded: true,
      }),
    ).toBe(5)
  })
})
