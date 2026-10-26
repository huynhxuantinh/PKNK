import { apiRequest } from './client'
import type { AdministrativeOption } from '../types/api'

export type OrganizationAdminRole = 'ORGANIZATION_ADMIN' | 'BRANCH_ADMIN'
export type OrganizationRole = OrganizationAdminRole | 'DENTIST' | 'PATIENT'

export interface ManagedOrganization {
  id_organization: number
  name: string
  slug: string
  timezone: string
  auto_confirm: boolean
  slot_hold_minutes: number
  cancellation_cutoff_minutes: number
  no_show_grace_minutes: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type OrganizationInput = Partial<
  Pick<
    ManagedOrganization,
    | 'name'
    | 'timezone'
    | 'auto_confirm'
    | 'slot_hold_minutes'
    | 'cancellation_cutoff_minutes'
    | 'no_show_grace_minutes'
    | 'is_active'
  >
>

export interface OrganizationBranch {
  id_branch: number
  organization_id: number
  code: string
  name: string
  phone: string | null
  email: string | null
  province_code: string
  ward_code: string
  address_line: string
  location: { latitude: number; longitude: number } | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface OrganizationBranchInput {
  code: string
  name: string
  phone?: string | null
  email?: string | null
  province_code: string
  ward_code: string
  address_line: string
  latitude: number
  longitude: number
  is_active?: boolean
}

export interface OrganizationMembership {
  id_membership: number
  user_id: number
  user_email: string
  user_full_name: string
  organization_id: number
  branch_id: number | null
  role: OrganizationAdminRole
  is_active: boolean
  created_at: string
}

export interface PendingMembershipInvitation {
  invitation_id: number
  status: 'PENDING'
}

export interface OrganizationMembershipInput {
  email: string
  role: OrganizationAdminRole
  branch_id?: number | null
}

export interface OrganizationMembershipPatch {
  role?: OrganizationAdminRole
  branch_id?: number | null
  is_active?: boolean
}

export interface OrganizationDentist {
  id_dentist: number
  user_id: number
  user_email: string
  full_name: string
  organization_id: number
  license_number: string | null
  biography: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface OrganizationDentistInput {
  email: string
  license_number?: string | null
  biography?: string | null
}

export interface OrganizationDentistPatch {
  license_number?: string | null
  biography?: string | null
  is_active?: boolean
}

export interface OrganizationService {
  id_service: number
  organization_id: number
  code: string
  name: string
  description: string | null
  standard_duration_minutes: number
  buffer_minutes: number
  standard_price: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface OrganizationServiceInput {
  code: string
  name: string
  description?: string | null
  standard_duration_minutes: number
  buffer_minutes: number
  standard_price: string
  is_active?: boolean
}

export interface RevenueBranchRow {
  branch_id: number
  branch_name: string
  revenue: string
  paid_invoice_count: number
}

export interface RevenueServiceRow {
  service_id: number | null
  service_code: string
  service_name: string
  revenue: string
  paid_invoice_count: number
}

export interface RevenuePeriodRow {
  period_start: string
  revenue: string
  paid_invoice_count: number
}

export interface RevenueReport {
  scope: 'ORGANIZATION' | 'BRANCH'
  date_from: string
  date_to: string
  timezone: string
  currency: string
  interval: 'DAY' | 'MONTH'
  total_revenue: string
  paid_invoice_count: number
  by_branch: RevenueBranchRow[]
  by_service: RevenueServiceRow[]
  by_period: RevenuePeriodRow[]
}

export interface AppointmentBranchRow {
  branch_id: number
  branch_name: string
  total_appointments: number
  completed_count: number
  cancelled_count: number
  no_show_count: number
  cancellation_rate_percent: string
  no_show_rate_percent: string
}

export interface AppointmentReport {
  scope: 'ORGANIZATION' | 'BRANCH'
  date_from: string
  date_to: string
  timezone: string
  total_appointments: number
  completed_count: number
  cancelled_count: number
  no_show_count: number
  cancellation_rate_percent: string
  no_show_rate_percent: string
  by_branch: AppointmentBranchRow[]
}

export interface ChairUtilizationChairRow {
  chair_id: number
  chair_code: string
  chair_name: string
  available_minutes: number
  occupied_minutes: number
  utilization_rate_percent: string
}

export interface ChairUtilizationBranchRow {
  branch_id: number
  branch_name: string
  chair_count: number
  open_days: number
  available_minutes: number
  occupied_minutes: number
  utilization_rate_percent: string
  by_chair: ChairUtilizationChairRow[]
}

export interface ChairUtilizationReport {
  scope: 'ORGANIZATION' | 'BRANCH'
  date_from: string
  date_to: string
  timezone: string
  included_statuses: string[]
  total_chairs: number
  available_minutes: number
  occupied_minutes: number
  utilization_rate_percent: string
  by_branch: ChairUtilizationBranchRow[]
}

export type OrganizationReportKind = 'revenue' | 'appointments' | 'chair-utilization'

export interface AuditEvent {
  id_audit_event: number
  actor_user_id: number | null
  actor_email: string | null
  organization_id: number | null
  branch_id: number | null
  action: string
  resource_type: string
  resource_id: string | null
  access_type: 'READ' | 'WRITE'
  before_data: Record<string, unknown>
  after_data: Record<string, unknown>
  ip_address: string | null
  user_agent: string
  request_id: string | null
  created_at: string
}

export interface AuditEventPage {
  count: number
  next: string | null
  previous: string | null
  results: AuditEvent[]
}

export interface AuditEventFilters {
  page?: number
  branch_id?: number
  action?: string
  access_type?: 'READ' | 'WRITE' | ''
}

const data = <T>(path: string, init: RequestInit = {}) =>
  apiRequest<{ data: T }>(path, init, { auth: true })

export function getOrganization(organizationId: number, signal?: AbortSignal) {
  return data<ManagedOrganization>(`/management/organizations/${organizationId}/`, { signal })
}

export function updateOrganization(organizationId: number, input: OrganizationInput) {
  return data<ManagedOrganization>(
    `/management/organizations/${organizationId}/`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
}

export function listOrganizationBranches(organizationId: number, signal?: AbortSignal) {
  return data<OrganizationBranch[]>(
    `/management/organizations/${organizationId}/branches/`,
    { signal },
  )
}

export function createOrganizationBranch(
  organizationId: number,
  input: OrganizationBranchInput,
) {
  return data<OrganizationBranch>(
    `/management/organizations/${organizationId}/branches/`,
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export function updateOrganizationBranch(
  branchId: number,
  input: Partial<OrganizationBranchInput>,
) {
  return data<OrganizationBranch>(
    `/management/branches/${branchId}/`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
}

export function listProvinces(signal?: AbortSignal) {
  return apiRequest<{ data: AdministrativeOption[] }>(
    '/branches/locations/provinces/',
    { signal },
  )
}

export function listWards(provinceCode: string, signal?: AbortSignal) {
  return apiRequest<{ data: AdministrativeOption[] }>(
    `/branches/locations/wards/?${new URLSearchParams({ province_code: provinceCode })}`,
    { signal },
  )
}

export function listOrganizationMemberships(
  organizationId: number,
  signal?: AbortSignal,
) {
  return data<OrganizationMembership[]>(
    `/management/organizations/${organizationId}/memberships/`,
    { signal },
  )
}

export function createOrganizationMembership(
  organizationId: number,
  input: OrganizationMembershipInput,
) {
  return data<OrganizationMembership | PendingMembershipInvitation>(
    `/management/organizations/${organizationId}/memberships/`,
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export function updateOrganizationMembership(
  membershipId: number,
  input: OrganizationMembershipPatch,
) {
  return data<OrganizationMembership>(
    `/management/memberships/${membershipId}/`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
}

export function listOrganizationDentists(
  organizationId: number,
  signal?: AbortSignal,
) {
  return data<OrganizationDentist[]>(
    `/management/organizations/${organizationId}/dentists/`,
    { signal },
  )
}

export function createOrganizationDentist(
  organizationId: number,
  input: OrganizationDentistInput,
) {
  return data<OrganizationDentist>(
    `/management/organizations/${organizationId}/dentists/`,
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export function updateOrganizationDentist(
  dentistId: number,
  input: OrganizationDentistPatch,
) {
  return data<OrganizationDentist>(
    `/management/dentists/${dentistId}/`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
}

export function getDentistBranches(dentistId: number, signal?: AbortSignal) {
  return data<OrganizationBranch[]>(
    `/management/dentists/${dentistId}/branches/`,
    { signal },
  )
}

export function replaceDentistBranches(dentistId: number, ids: number[]) {
  return data<OrganizationBranch[]>(
    `/management/dentists/${dentistId}/branches/`,
    { method: 'PUT', body: JSON.stringify({ ids }) },
  )
}

export function getDentistServices(dentistId: number, signal?: AbortSignal) {
  return data<OrganizationService[]>(
    `/management/dentists/${dentistId}/services/`,
    { signal },
  )
}

export function replaceDentistServices(dentistId: number, ids: number[]) {
  return data<OrganizationService[]>(
    `/management/dentists/${dentistId}/services/`,
    { method: 'PUT', body: JSON.stringify({ ids }) },
  )
}

export function listOrganizationServices(
  organizationId: number,
  signal?: AbortSignal,
) {
  return data<OrganizationService[]>(
    `/management/organizations/${organizationId}/services/`,
    { signal },
  )
}

export function createOrganizationService(
  organizationId: number,
  input: OrganizationServiceInput,
) {
  return data<OrganizationService>(
    `/management/organizations/${organizationId}/services/`,
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export function updateOrganizationService(
  serviceId: number,
  input: Partial<OrganizationServiceInput>,
) {
  return data<OrganizationService>(
    `/management/services/${serviceId}/`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
}

export function organizationReport<K extends OrganizationReportKind>(
  organizationId: number,
  kind: K,
  dateFrom: string,
  dateTo: string,
  signal?: AbortSignal,
): Promise<{
  data: K extends 'revenue'
    ? RevenueReport
    : K extends 'appointments'
      ? AppointmentReport
      : ChairUtilizationReport
}> {
  const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
  if (kind === 'revenue') params.set('interval', 'DAY')
  return apiRequest(
    `/management/organizations/${organizationId}/reports/${kind}/?${params}`,
    { signal },
    { auth: true },
  )
}

export function listOrganizationAuditEvents(
  organizationId: number,
  filters: AuditEventFilters,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams()
  if (filters.page && filters.page > 1) params.set('page', String(filters.page))
  if (filters.branch_id) params.set('branch_id', String(filters.branch_id))
  if (filters.action?.trim()) params.set('action', filters.action.trim())
  if (filters.access_type) params.set('access_type', filters.access_type)
  const query = params.toString()
  return apiRequest<AuditEventPage>(
    `/audit/organizations/${organizationId}/events/${query ? `?${query}` : ''}`,
    { signal },
    { auth: true },
  )
}
