import { apiRequest } from './client'

export type ManagementAppointmentStatus = 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'

export interface ManagementAppointment {
  public_code: string
  branch_id: number
  service_name_snapshot: string
  patient_name: string
  patient_phone: string | null
  dentist_name: string
  chair_name: string | null
  starts_at: string
  ends_at: string
  status: ManagementAppointmentStatus
}

interface ManagementAppointmentsResponse { data: ManagementAppointment[]; meta: { count: number } }

export function listBranchAppointments(branchId: number, date: Date, status?: ManagementAppointmentStatus) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const params = new URLSearchParams({ date_from: start.toISOString(), date_to: end.toISOString() })
  if (status) params.set('status', status)
  return apiRequest<ManagementAppointmentsResponse>(`/management/branches/${branchId}/appointments/?${params}`, {}, { auth: true })
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
