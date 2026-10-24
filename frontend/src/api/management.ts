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
export interface ManagedDentist { id_dentist: number; full_name: string; is_active: boolean }
export interface ManagedWorkShift { id_work_shift: number; branch_id: number; dentist_id: number; weekday: number; start_time: string; end_time: string; valid_from: string; valid_to: string | null; is_active: boolean }
export interface ManagedTimeOff { id_time_off: number; branch_id: number | null; dentist_id: number; starts_at: string; ends_at: string; reason: string; is_active: boolean }
export type ManagedInvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID'
export interface ManagedInvoiceLine { id_invoice_line: number; service_id: number | null; service_code_snapshot: string; description: string; quantity: number; unit_price: string; line_total: string }
export interface ManagedInvoicePayment { id_payment: number; payment_number: string; method: string; amount: string; status: 'POSTED' | 'VOID'; external_reference: string; posted_at: string; voided_at: string | null; void_reason: string }
export interface ManagedInvoice {
  id_invoice: number; invoice_number: string; appointment_code: string; branch_id: number
  patient_profile_id: number; patient_name: string; replacement_for_id: number | null
  status: ManagedInvoiceStatus; currency: 'VND'; subtotal: string; discount: string; total: string
  lines: ManagedInvoiceLine[]; payments: ManagedInvoicePayment[]; issued_at: string | null
  paid_at: string | null; voided_at: string | null; void_reason: string; created_at: string
}
export interface ManagedBranchDetail { id_branch: number; organization_id: number; code: string; name: string; is_active: boolean }
export interface ManagedOpeningHour { weekday: number; is_closed: boolean; open_time: string | null; close_time: string | null }
export interface ManagedChair { id_chair: number; branch_id: number; code: string; name: string; resource_type: 'CHAIR' | 'ROOM'; is_active: boolean }
export interface ManagedService { id_service: number; organization_id: number; code: string; name: string; description: string | null; standard_duration_minutes: number; buffer_minutes: number; standard_price: string; is_active: boolean }
export interface ManagedBranchService { id_branch_service: number; branch_id: number; service_id: number; service_name: string; price: string; duration_minutes: number | null; buffer_minutes: number | null; is_active: boolean }
export interface ManagedHoliday { id_holiday: number; organization_id: number; branch_id: number | null; holiday_date: string; name: string; is_closed: boolean }

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

export const listManagedWorkShifts = (branchId: number) => apiRequest<{ data: ManagedWorkShift[] }>(`/management/branches/${branchId}/work-shifts/`, {}, { auth: true })
export const listManagedBranchDentists = (branchId: number) => apiRequest<{ data: ManagedDentist[] }>(`/management/branches/${branchId}/dentists/`, {}, { auth: true })
export const createManagedWorkShift = (branchId: number, data: Omit<ManagedWorkShift, 'id_work_shift' | 'branch_id'>) => apiRequest<{ data: ManagedWorkShift }>(`/management/branches/${branchId}/work-shifts/`, { method: 'POST', body: JSON.stringify(data) }, { auth: true })
export const patchManagedWorkShift = (id: number, data: Partial<ManagedWorkShift>) => apiRequest<{ data: ManagedWorkShift }>(`/management/work-shifts/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }, { auth: true })
export const listManagedTimeOffs = (branchId: number) => apiRequest<{ data: ManagedTimeOff[] }>(`/management/branches/${branchId}/time-offs/`, {}, { auth: true })
export const createManagedTimeOff = (branchId: number, data: Omit<ManagedTimeOff, 'id_time_off' | 'branch_id'> & { applies_to_all_branches?: boolean }) => apiRequest<{ data: ManagedTimeOff }>(`/management/branches/${branchId}/time-offs/`, { method: 'POST', body: JSON.stringify(data) }, { auth: true })
export const patchManagedTimeOff = (id: number, data: Partial<ManagedTimeOff>) => apiRequest<{ data: ManagedTimeOff }>(`/management/time-offs/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }, { auth: true })

export const branchReport = (branchId: number, name: 'revenue' | 'appointments' | 'chair-utilization', dateFrom: string, dateTo: string) => apiRequest<{ data: Record<string, unknown> }>(`/management/branches/${branchId}/reports/${name}/?${new URLSearchParams({ date_from: dateFrom, date_to: dateTo, ...(name === 'revenue' ? { interval: 'DAY' } : {}) })}`, {}, { auth: true })

export function listManagedInvoices(branchId: number, status?: ManagedInvoiceStatus) {
  const query = status ? `?status=${status}` : ''
  return apiRequest<{ data: ManagedInvoice[] }>(`/management/branches/${branchId}/invoices/${query}`, {}, { auth: true })
}
export const getManagedInvoice = (id: number) => apiRequest<{ data: ManagedInvoice }>(`/management/invoices/${id}/`, {}, { auth: true })
export const createManagedInvoice = (branchId: number, appointmentCode: string, replacementForId?: number) => apiRequest<{ data: ManagedInvoice }>(`/management/branches/${branchId}/invoices/`, { method: 'POST', body: JSON.stringify({ appointment_code: appointmentCode, ...(replacementForId ? { replacement_for_id: replacementForId } : {}) }) }, { auth: true })
export const issueManagedInvoice = (id: number) => apiRequest<{ data: ManagedInvoice }>(`/management/invoices/${id}/issue/`, { method: 'POST' }, { auth: true })
export const voidManagedInvoice = (id: number, reason: string) => apiRequest<{ data: ManagedInvoice }>(`/management/invoices/${id}/void/`, { method: 'POST', body: JSON.stringify({ reason }) }, { auth: true })

export const getManagedBranch = (branchId: number) => apiRequest<{ data: ManagedBranchDetail }>(`/management/branches/${branchId}/`, {}, { auth: true })
export const listManagedOpeningHours = (branchId: number) => apiRequest<{ data: ManagedOpeningHour[] }>(`/management/branches/${branchId}/opening-hours/`, {}, { auth: true })
export const replaceManagedOpeningHours = (branchId: number, openingHours: ManagedOpeningHour[]) => apiRequest<{ data: ManagedOpeningHour[] }>(`/management/branches/${branchId}/opening-hours/`, { method: 'PUT', body: JSON.stringify({ opening_hours: openingHours }) }, { auth: true })
export const listManagedChairs = (branchId: number) => apiRequest<{ data: ManagedChair[] }>(`/management/branches/${branchId}/chairs/`, {}, { auth: true })
export const createManagedChair = (branchId: number, data: Omit<ManagedChair, 'id_chair' | 'branch_id'>) => apiRequest<{ data: ManagedChair }>(`/management/branches/${branchId}/chairs/`, { method: 'POST', body: JSON.stringify(data) }, { auth: true })
export const patchManagedChair = (chairId: number, data: Partial<ManagedChair>) => apiRequest<{ data: ManagedChair }>(`/management/chairs/${chairId}/`, { method: 'PATCH', body: JSON.stringify(data) }, { auth: true })
export const listManagedOrganizationServices = (organizationId: number) => apiRequest<{ data: ManagedService[] }>(`/management/organizations/${organizationId}/services/`, {}, { auth: true })
export const listManagedBranchServices = (branchId: number) => apiRequest<{ data: ManagedBranchService[] }>(`/management/branches/${branchId}/services/`, {}, { auth: true })
export const createManagedBranchService = (branchId: number, data: Omit<ManagedBranchService, 'id_branch_service' | 'branch_id' | 'service_name'>) => apiRequest<{ data: ManagedBranchService }>(`/management/branches/${branchId}/services/`, { method: 'POST', body: JSON.stringify(data) }, { auth: true })
export const patchManagedBranchService = (branchServiceId: number, data: Partial<ManagedBranchService>) => apiRequest<{ data: ManagedBranchService }>(`/management/branch-services/${branchServiceId}/`, { method: 'PATCH', body: JSON.stringify(data) }, { auth: true })
export const listManagedHolidays = (organizationId: number) => apiRequest<{ data: ManagedHoliday[] }>(`/management/organizations/${organizationId}/holidays/`, {}, { auth: true })
export const createManagedHoliday = (organizationId: number, data: Omit<ManagedHoliday, 'id_holiday' | 'organization_id'>) => apiRequest<{ data: ManagedHoliday }>(`/management/organizations/${organizationId}/holidays/`, { method: 'POST', body: JSON.stringify(data) }, { auth: true })
export const patchManagedHoliday = (holidayId: number, data: Partial<ManagedHoliday>) => apiRequest<{ data: ManagedHoliday }>(`/management/holidays/${holidayId}/`, { method: 'PATCH', body: JSON.stringify(data) }, { auth: true })
export const deleteManagedHoliday = (holidayId: number) => apiRequest<void>(`/management/holidays/${holidayId}/`, { method: 'DELETE' }, { auth: true })
