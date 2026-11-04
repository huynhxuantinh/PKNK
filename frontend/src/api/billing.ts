import type { PatientInvoice } from '../types/api'
import { apiRequest } from './client'

export const createPayosPayment = (invoiceId: number) => apiRequest<{
  data: { order_code: number; checkout_url: string }
}>(`/patients/me/invoices/${invoiceId}/payos/`, { method: 'POST' }, { auth: true })

export const getPatientInvoice = (invoiceId: number, signal?: AbortSignal) => apiRequest<{ data: PatientInvoice }>(
  `/patients/me/invoices/${invoiceId}/`, { signal }, { auth: true },
)
