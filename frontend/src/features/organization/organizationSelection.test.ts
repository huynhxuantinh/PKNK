import { describe, expect, it } from 'vitest'

import { resolveOrganizationId } from './organizationSelection'

describe('resolveOrganizationId', () => {
  const allowed = [3, 7]

  it('keeps an organization that belongs to the administrator', () => {
    expect(resolveOrganizationId(7, allowed)).toBe(7)
  })

  it('falls back to the first organization for missing or unauthorized ids', () => {
    expect(resolveOrganizationId(null, allowed)).toBe(3)
    expect(resolveOrganizationId(999, allowed)).toBe(3)
  })

  it('returns null when the administrator has no organization', () => {
    expect(resolveOrganizationId(3, [])).toBeNull()
  })
})
