import { apiRequest } from './client'
import type { Slot } from '../types/api'

export type ManagementAppointmentStatus = 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'

export interface ManagementAppointment {
  public_code: string
  branch_id: number
  service_name_snapshot: string
  patient_name: string
  patient_phone: string | null
  dentist_name: string
  dentist_id: number
  chair_name: string | null
  starts_at: string
  ends_at: string
  status: ManagementAppointmentStatus
  confirmed_at: string | null
  checked_in_at: string | null
  cancelled_at: string | null
  no_show_at: string | null
  cancel_reason: string | null
  rescheduled_from_code: string | null
}

export interface ManagedBranch {
  id_branch: number
  name: string
  is_active: boolean
}

interface ManagementAppointmentsResponse { data: ManagementAppointment[]; meta: { count: number } }

function nextHcmDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}

export function listBranchAppointments(branchId: number, date: string, status?: ManagementAppointmentStatus, dentistId?: number, days = 1) {
  let endDate = date
  for (let index = 0; index < days; index += 1) endDate = nextHcmDate(endDate)
  const params = new URLSearchParams({ date_from: `${date}T00:00:00+07:00`, date_to: `${endDate}T00:00:00+07:00` })
  if (status) params.set('status', status)
  if (dentistId) params.set('dentist_id', String(dentistId))
  return apiRequest<ManagementAppointmentsResponse>(`/management/branches/${branchId}/appointments/?${params}`, {}, { auth: true })
}

export function listManagedOrganizationBranches(organizationId: number) {
  return apiRequest<{ data: ManagedBranch[] }>(`/management/organizations/${organizationId}/branches/`, {}, { auth: true })
}

function updateAppointment(publicCode: string, action: 'confirm' | 'check-in' | 'no-show') {
  return apiRequest<{ data: ManagementAppointment }>(`/management/appointments/${publicCode}/${action}/`, { method: 'POST' }, { auth: true })
}

export const confirmManagedAppointment = (code: string) => updateAppointment(code, 'confirm')
export const checkInManagedAppointment = (code: string) => updateAppointment(code, 'check-in')
export const markManagedAppointmentNoShow = (code: string) => updateAppointment(code, 'no-show')

export function cancelManagedAppointment(publicCode: string, reason: string) {
  return apiRequest<{ data: ManagementAppointment }>(`/management/appointments/${publicCode}/cancel/`, { method: 'POST', body: JSON.stringify({ reason }) }, { auth: true })
}

export function listManagedRescheduleSlots(publicCode: string, date: string, dentistId?: number) {
  const params = new URLSearchParams({ date })
  if (dentistId) params.set('dentist_id', String(dentistId))
  return apiRequest<{ data: Slot[] }>(`/management/appointments/${publicCode}/reschedule-slots/?${params}`, {}, { auth: true })
}

export function rescheduleManagedAppointment(publicCode: string, data: { starts_at: string; reason: string; idempotency_key: string; dentist_id?: number }) {
  return apiRequest<{ data: ManagementAppointment }>(`/management/appointments/${publicCode}/reschedule/`, { method: 'POST', body: JSON.stringify(data) }, { auth: true })
}
