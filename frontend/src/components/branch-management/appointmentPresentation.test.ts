import { describe, expect, it } from 'vitest'

import type { ManagementAppointment } from '../../api/management'
import { appointmentActionHint, appointmentActionWindow } from './appointmentPresentation'

const appointment: ManagementAppointment = {
  public_code: 'APT-ACTION-WINDOW',
  branch_id: 1,
  service_name_snapshot: 'Khám tổng quát',
  patient_name: 'Nguyễn An',
  patient_phone: null,
  contact_name_snapshot: null,
  contact_phone_snapshot: null,
  contact_email_snapshot: null,
  patient_note: '',
  dentist_name: 'Bác sĩ An',
  dentist_id: 1,
  chair_name: 'Ghế 1',
  starts_at: '2026-11-05T02:00:00Z',
  ends_at: '2026-11-05T02:30:00Z',
  status: 'CONFIRMED',
  confirmed_at: null,
  checked_in_at: null,
  cancelled_at: null,
  no_show_at: null,
  cancel_reason: null,
  rescheduled_from_code: null,
  check_in_opens_at: '2026-11-05T00:00:00Z',
  no_show_opens_at: '2026-11-05T02:15:00Z',
}

describe('appointment action window', () => {
  it('opens check-in two hours before the appointment and no-show after grace', () => {
    const beforeCheckIn = appointmentActionWindow(
      appointment,
      Date.parse('2026-11-04T23:59:00Z'),
    )
    const checkInOpen = appointmentActionWindow(
      appointment,
      Date.parse('2026-11-05T00:00:00Z'),
    )
    const noShowOpen = appointmentActionWindow(
      appointment,
      Date.parse('2026-11-05T02:15:00Z'),
    )

    expect(beforeCheckIn.canCheckIn).toBe(false)
    expect(checkInOpen.canCheckIn).toBe(true)
    expect(checkInOpen.canMarkNoShow).toBe(false)
    expect(noShowOpen.canCheckIn).toBe(true)
    expect(noShowOpen.canMarkNoShow).toBe(true)
  })

  it('shows the appropriate upcoming-action hint', () => {
    expect(
      appointmentActionHint(appointment, Date.parse('2026-11-04T23:00:00Z')),
    ).toContain('Có thể check-in từ')
    expect(
      appointmentActionHint(appointment, Date.parse('2026-11-05T02:05:00Z')),
    ).toContain('Có thể đánh dấu không đến từ')
  })
})
