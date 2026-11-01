import { describe, expect, it } from 'vitest'

import { settledMapWithConcurrency } from './OrganizationStaffSchedulePage'

describe('settledMapWithConcurrency', () => {
  it('limits concurrent work and preserves result order', async () => {
    let active = 0
    let peak = 0
    const results = await settledMapWithConcurrency([1, 2, 3, 4, 5], async (item) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 1))
      active -= 1
      return item * 2
    }, 2)

    expect(peak).toBeLessThanOrEqual(2)
    expect(results.map((result) => result.status === 'fulfilled' ? result.value : null)).toEqual([2, 4, 6, 8, 10])
  })
})
