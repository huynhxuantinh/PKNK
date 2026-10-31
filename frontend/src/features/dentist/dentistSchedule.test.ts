import { describe, expect, it } from 'vitest'

import type { DentistAppointmentStatus } from '../../types/api'
import { filterDentistSchedule, scheduleRange } from './dentistSchedule'

type Item = {
  branch_id: number
  starts_at: string
  status: DentistAppointmentStatus
}

const items: Item[] = [
  { branch_id: 1, starts_at: '2026-10-25T01:00:00+07:00', status: 'CONFIRMED' },
  { branch_id: 1, starts_at: '2026-10-25T09:00:00+07:00', status: 'COMPLETED' },
  { branch_id: 1, starts_at: '2026-10-25T10:00:00+07:00', status: 'CANCELLED' },
  { branch_id: 1, starts_at: '2026-10-25T11:00:00+07:00', status: 'NO_SHOW' },
  { branch_id: 2, starts_at: '2026-10-25T12:00:00+07:00', status: 'COMPLETED' },
]

describe('dentist schedule view', () => {
  it('loads seven days for upcoming and one selected day for history', () => {
    const upcoming = scheduleRange('UPCOMING', '2026-10-25')
    const history = scheduleRange('HISTORY', '2026-10-10')

    expect(upcoming.start.toISOString()).toBe('2026-10-24T17:00:00.000Z')
    expect(upcoming.end.toISOString()).toBe('2026-10-31T17:00:00.000Z')
    expect(history.start.toISOString()).toBe('2026-10-09T17:00:00.000Z')
    expect(history.end.toISOString()).toBe('2026-10-10T17:00:00.000Z')
  })

  it('separates active appointments from completed, cancelled, and no-show history', () => {
    expect(filterDentistSchedule(items, 1, 'UPCOMING', 'ALL')).toEqual([items[0]])
    expect(filterDentistSchedule(items, 1, 'HISTORY', 'ALL')).toEqual([items[1], items[2], items[3]])
  })

  it('filters history by completed and no-show status', () => {
    expect(filterDentistSchedule(items, 1, 'HISTORY', 'COMPLETED')).toEqual([items[1]])
    expect(filterDentistSchedule(items, 1, 'HISTORY', 'CANCELLED')).toEqual([items[2]])
    expect(filterDentistSchedule(items, 1, 'HISTORY', 'NO_SHOW')).toEqual([items[3]])
  })
})
