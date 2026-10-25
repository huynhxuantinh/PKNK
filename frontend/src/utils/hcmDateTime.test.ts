import { describe, expect, it } from 'vitest'

import {
  formatHcmDay,
  formatHcmTime,
  isOnHcmDay,
  upcomingHcmRange,
} from './hcmDateTime'

describe('Ho Chi Minh City date and time helpers', () => {
  const now = new Date('2026-10-24T18:30:00.000Z') // 01:30 ngày 25/10 tại HCM

  it('builds a seven-day calendar range from HCM midnight', () => {
    const range = upcomingHcmRange(now)

    expect(range.start.toISOString()).toBe('2026-10-24T17:00:00.000Z')
    expect(range.end.toISOString()).toBe('2026-10-31T17:00:00.000Z')
  })

  it('compares today and tomorrow using the HCM calendar date', () => {
    expect(isOnHcmDay('2026-10-24T17:30:00.000Z', 0, now)).toBe(true)
    expect(isOnHcmDay('2026-10-25T17:30:00.000Z', 1, now)).toBe(true)
    expect(isOnHcmDay('2026-10-24T16:30:00.000Z', 0, now)).toBe(false)
  })

  it('formats appointment labels in the HCM timezone', () => {
    expect(formatHcmTime('2026-10-24T18:30:00.000Z')).toBe('01:30')
    expect(formatHcmDay('2026-10-24T17:30:00.000Z', now)).toBe('Hôm nay')
    expect(formatHcmDay('2026-10-25T17:30:00.000Z', now)).toBe('Ngày mai')
  })
})
