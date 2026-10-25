export interface PaginationMeta {
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: PaginationMeta
  links: {
    next: string | null
    previous: string | null
  }
}

export interface Branch {
  id_branch: number
  code: string
  name: string
  phone: string | null
  province_code: string
  province_name: string
  ward_code: string
  ward_name: string
  address_line: string
  full_address: string
  location: {
    latitude: number
    longitude: number
  }
  distance_km: number | null
  is_open_now: boolean
  primary_image: {
    id_branch_image: number
    storage_key: string
    original_name: string
    mime_type: string
    is_primary: boolean
    sort_order: number
  } | null
}

export interface BranchService {
  id_branch_service: number
  id_service: number
  code: string
  name: string
  description: string | null
  price: string
  duration_minutes: number
  buffer_minutes: number
}

export interface BranchOpeningHour {
  weekday: number
  weekday_label: string
  is_closed: boolean
  open_time: string | null
  close_time: string | null
}

export interface BranchDentist {
  id_dentist: number
  full_name: string
  license_number: string
  biography: string | null
}

export interface BranchDetail {
  id_branch: number
  code: string
  name: string
  phone: string | null
  email: string | null
  province_code: string
  province_name: string
  ward_code: string
  ward_name: string
  full_address: string
  location: {
    latitude: number
    longitude: number
  }
  opening_hours: BranchOpeningHour[]
  images: Array<{
    id_branch_image: number
    storage_key: string
    original_name: string
    mime_type: string
    is_primary: boolean
    sort_order: number
  }>
  services: BranchService[]
  dentists: BranchDentist[]
}

export interface Slot {
  starts_at: string
  ends_at: string
  available_dentist_ids: number[]
  available_dentist_count: number
  available_chair_count: number
}

export interface SlotResponse {
  data: Slot[]
  meta: {
    date: string
    slot_step_minutes: number
    count: number
  }
}

export interface User {
  id_user: number
  email: string
  full_name: string
  email_verified_at: string | null
  email_verified: boolean
  memberships?: Membership[]
}

export interface Membership {
  role: 'PATIENT' | 'DENTIST' | 'BRANCH_ADMIN' | 'ORGANIZATION_ADMIN'
  is_active: boolean
  organization_id: number
  organization_name: string
  branch_id: number | null
  branch_name: string | null
}

export interface TokenPair {
  access: string
  refresh: string
}

export interface LoginResponse {
  data: {
    user: User
    tokens: TokenPair
  }
}

export interface PatientProfile {
  email: string
  email_verified: boolean
  full_name: string
  date_of_birth: string | null
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null
  phone: string | null
  province_code: string | null
  province_name: string | null
  ward_code: string | null
  ward_name: string | null
  address_line: string | null
  updated_at: string
}

export interface PatientProfileResponse {
  data: PatientProfile
}

export interface AdministrativeOption {
  code: string
  full_name: string
}

export interface AdministrativeOptionsResponse {
  data: AdministrativeOption[]
}

export interface Appointment {
  public_code: string
  status: 'HELD' | 'PENDING' | 'CONFIRMED'
  id_branch: number
  id_branch_service: number
  id_dentist: number
  dentist_name: string
  id_chair: number
  chair_name: string
  service_name_snapshot: string
  contact_name_snapshot: string | null
  contact_phone_snapshot: string | null
  contact_email_snapshot: string | null
  patient_note: string
  starts_at: string
  ends_at: string
  held_at: string | null
  expires_at: string | null
  confirmed_at: string | null
}

export interface AppointmentResponse {
  data: Appointment
}

export type PatientAppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'

export interface PatientAppointment {
  public_code: string
  status: PatientAppointmentStatus
  branch_id: number
  branch_name: string
  branch_address: string
  branch_service_id: number
  service_name_snapshot: string
  patient_note: string
  dentist_name: string
  dentist_id: number | null
  starts_at: string
  ends_at: string
  can_cancel: boolean
  can_reschedule: boolean
}

export interface PatientAppointmentsResponse {
  data: PatientAppointment[]
  meta: {
    count: number
    page: number
    page_size: number
    total_pages: number
  }
}

export interface PatientClinicalEncounter {
  id_clinical_encounter: number
  appointment_code: string
  service_name: string
  dentist_name: string
  branch_id: number
  branch_name: string
  examined_at: string | null
  completed_at: string | null
  chief_complaint: string
  diagnosis_summary: string
  aftercare_instructions: string
  finalized_at: string
  attachments: ClinicalAttachment[]
}

export interface ClinicalAttachment {
  id_clinical_attachment: number
  kind: 'XRAY' | 'PHOTO' | 'DOCUMENT'
  content_type: string
  size_bytes: number
  description: string
  download_url: string
}

export interface PatientInvoice {
  id_invoice: number
  invoice_number: string
  appointment_code: string
  branch_name: string
  status: 'ISSUED' | 'PAID'
  currency: string
  subtotal: string
  discount: string
  total: string
  issued_at: string | null
  paid_at: string | null
}

export interface PatientInvoicesResponse {
  data: PatientInvoice[]
  meta: { count: number; page: number; page_size: number; total_pages: number }
}

export interface Notification {
  id_notification: number
  type: string
  title: string
  body: string
  payload: Record<string, unknown>
  resource_type: string
  resource_id: string
  read_at: string | null
  created_at: string
}

export interface NotificationsResponse { data: Notification[]; meta: { count: number } }

export interface PatientClinicalEncountersResponse {
  data: PatientClinicalEncounter[]
}

export type DentistAppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'

export interface DentistAppointment {
  public_code: string
  patient_profile_id: number
  branch_id: number
  branch_name: string
  branch_service_id: number
  service_name_snapshot: string
  chair_id: number
  chair_name: string
  patient_name: string
  patient_phone: string | null
  contact_name_snapshot: string | null
  contact_phone_snapshot: string | null
  contact_email_snapshot: string | null
  patient_note: string
  starts_at: string
  ends_at: string
  status: DentistAppointmentStatus
  confirmed_at: string | null
  checked_in_at: string | null
  started_at: string | null
}

export interface DentistScheduleResponse {
  data: DentistAppointment[]
  meta: { count: number }
}

export interface DentistPatientSummary {
  id_patient_profile: number
  full_name: string
  date_of_birth: string | null
  gender: string
  phone: string
  appointment_context: {
    public_code: string
    branch_id: number
    service_name: string
    status: DentistAppointmentStatus
  }
  clinical_history: PatientClinicalEncounter[]
}

export interface ClinicalEncounter {
  id_clinical_encounter: number
  appointment_id: number
  status: 'DRAFT' | 'FINALIZED'
  chief_complaint: string
  medical_history: string
  diagnosis_summary: string
  notes: string
  aftercare_instructions: string
  finalized_at: string | null
  updated_at: string
  attachments: ClinicalAttachment[]
}
