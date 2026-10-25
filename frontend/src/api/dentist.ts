import { apiRequest } from './client'
import type { ClinicalEncounter, DentistAppointment, DentistScheduleResponse } from '../types/api'

export function listDentistSchedule(dateFrom: Date, dateTo: Date) {
  const params = new URLSearchParams({
    date_from: dateFrom.toISOString(),
    date_to: dateTo.toISOString(),
  })
  return apiRequest<DentistScheduleResponse>(`/dentist/me/schedule/?${params}`, {}, { auth: true })
}

export function startDentistAppointment(publicCode: string) {
  return apiRequest<{ data: DentistAppointment }>(
    `/dentist/me/appointments/${publicCode}/start/`,
    { method: 'POST' },
    { auth: true },
  )
}

export function getDentistAppointment(publicCode: string) {
  return apiRequest<{ data: DentistAppointment }>(`/dentist/me/appointments/${publicCode}/`, {}, { auth: true })
}

export function getClinicalEncounter(publicCode: string) {
  return apiRequest<{ data: ClinicalEncounter }>(`/dentist/me/appointments/${publicCode}/clinical-encounter/`, {}, { auth: true })
}

export function createClinicalEncounter(publicCode: string) {
  return apiRequest<{ data: ClinicalEncounter }>(
    `/dentist/me/appointments/${publicCode}/clinical-encounter/`,
    { method: 'POST', body: JSON.stringify({}) },
    { auth: true },
  )
}

export function updateClinicalEncounter(encounterId: number, input: Pick<ClinicalEncounter, 'chief_complaint' | 'medical_history' | 'diagnosis_summary' | 'notes'>) {
  return apiRequest<{ data: ClinicalEncounter }>(
    `/dentist/me/clinical-encounters/${encounterId}/`,
    { method: 'PATCH', body: JSON.stringify(input) },
    { auth: true },
  )
}

export function finalizeClinicalEncounter(encounterId: number) {
  return apiRequest<{ data: ClinicalEncounter }>(
    `/dentist/me/clinical-encounters/${encounterId}/finalize/`,
    { method: 'POST' },
    { auth: true },
  )
}

export function completeDentistAppointment(publicCode: string) {
  return apiRequest<{ data: DentistAppointment }>(
    `/dentist/me/appointments/${publicCode}/complete/`,
    { method: 'POST' },
    { auth: true },
  )
}

export function finalizeAndCompleteDentistAppointment(
  publicCode: string,
  input: Pick<ClinicalEncounter, 'chief_complaint' | 'medical_history' | 'diagnosis_summary' | 'notes'>,
) {
  return apiRequest<{
    data: { appointment: DentistAppointment; encounter: ClinicalEncounter }
  }>(
    `/dentist/me/appointments/${publicCode}/finalize-and-complete/`,
    { method: 'POST', body: JSON.stringify(input) },
    { auth: true },
  )
}
