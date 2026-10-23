import { apiRequest } from './client'
import type {
  AppointmentResponse,
  Branch,
  BranchDentist,
  BranchDetail,
  BranchService,
  PaginatedResponse,
  SlotResponse,
} from '../types/api'

export interface BranchFilters {
  query?: string
  wardCode?: string
  serviceId?: number
  openNow?: boolean
  latitude?: number
  longitude?: number
  radiusKm?: number
}

export function listBranches(filters: string | BranchFilters = '', signal?: AbortSignal) {
  const params = new URLSearchParams({ page_size: '100' })
  const normalized: BranchFilters = typeof filters === 'string' ? { query: filters } : filters
  if (normalized.query?.trim()) params.set('q', normalized.query.trim())
  if (normalized.wardCode) params.set('ward_code', normalized.wardCode)
  if (normalized.serviceId) params.set('service_id', String(normalized.serviceId))
  if (normalized.openNow) params.set('open_now', 'true')
  if (normalized.latitude !== undefined && normalized.longitude !== undefined) {
    params.set('latitude', String(normalized.latitude))
    params.set('longitude', String(normalized.longitude))
  }
  if (normalized.radiusKm) params.set('radius_km', String(normalized.radiusKm))
  return apiRequest<PaginatedResponse<Branch>>(
    `/branches/?${params}`,
    { signal },
  )
}

export function getBranchDetail(branchId: number, signal?: AbortSignal) {
  return apiRequest<{ data: BranchDetail }>(
    `/branches/${branchId}/`,
    { signal },
  )
}

export function listBranchServices(branchId: number, signal?: AbortSignal) {
  return apiRequest<PaginatedResponse<BranchService>>(
    `/branches/${branchId}/services/?page_size=100`,
    { signal },
  )
}

export function listBranchDentists(
  branchId: number,
  serviceId: number,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    service_id: String(serviceId),
    page_size: '100',
  })
  return apiRequest<PaginatedResponse<BranchDentist>>(
    `/branches/${branchId}/dentists/?${params}`,
    { signal },
  )
}

export function listSlots(
  branchServiceId: number,
  date: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    branch_service_id: String(branchServiceId),
    date,
  })
  return apiRequest<SlotResponse>(`/scheduling/slots/?${params}`, { signal })
}

export function createAppointmentHold(
  branchServiceId: number,
  startsAt: string,
  dentistId?: number,
  bookingDetails?: {
    contactName: string
    contactPhone: string
    contactEmail: string
    patientNote: string
  },
) {
  return apiRequest<AppointmentResponse>(
    '/scheduling/appointments/holds/',
    {
      method: 'POST',
      body: JSON.stringify({
        branch_service_id: branchServiceId,
        starts_at: startsAt,
        ...(dentistId ? { dentist_id: dentistId } : {}),
        ...(bookingDetails ? {
          contact_name: bookingDetails.contactName,
          contact_phone: bookingDetails.contactPhone,
          contact_email: bookingDetails.contactEmail,
          patient_note: bookingDetails.patientNote,
        } : {}),
      }),
    },
    { auth: true },
  )
}

export function confirmAppointment(publicCode: string) {
  return apiRequest<AppointmentResponse>(
    `/scheduling/appointments/${publicCode}/confirm/`,
    { method: 'POST' },
    { auth: true },
  )
}

export function cancelAppointmentHold(publicCode: string) {
  return apiRequest<AppointmentResponse>(
    `/scheduling/appointments/${publicCode}/holds/cancel/`,
    { method: 'POST' },
    { auth: true },
  )
}
