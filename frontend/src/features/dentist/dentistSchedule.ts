import type { DentistAppointmentStatus } from '../../types/api'
import { hcmDateRange } from '../../utils/hcmDateTime'

export type DentistScheduleView = 'UPCOMING' | 'HISTORY'

type ScheduleItem = {
  branch_id: number
  status: DentistAppointmentStatus
}

const UPCOMING_STATUSES = new Set<DentistAppointmentStatus>([
  'PENDING',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
])

const HISTORY_STATUSES = new Set<DentistAppointmentStatus>([
  'COMPLETED',
  'NO_SHOW',
])

export function scheduleRange(view: DentistScheduleView, selectedDate: string) {
  return hcmDateRange(selectedDate, view === 'UPCOMING' ? 7 : 1)
}

export function filterDentistSchedule<T extends ScheduleItem>(
  appointments: T[],
  branchId: number | null,
  view: DentistScheduleView,
  status: 'ALL' | DentistAppointmentStatus,
) {
  const allowedStatuses = view === 'UPCOMING' ? UPCOMING_STATUSES : HISTORY_STATUSES
  return appointments.filter((appointment) => (
    appointment.branch_id === branchId
      && allowedStatuses.has(appointment.status)
      && (status === 'ALL' || appointment.status === status)
  ))
}
