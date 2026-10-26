import type {
  OrganizationBranch,
  OrganizationBranchInput,
  OrganizationDentistInput,
  OrganizationServiceInput,
} from '../../api/organization'

export interface BranchFormState {
  code: string
  name: string
  phone: string
  email: string
  provinceCode: string
  wardCode: string
  addressLine: string
  latitude: string
  longitude: string
  isActive: boolean
}

export interface ServiceFormState {
  code: string
  name: string
  description: string
  durationMinutes: string
  bufferMinutes: string
  standardPrice: string
  isActive: boolean
}

export interface DentistFormState {
  email: string
  licenseNumber: string
  biography: string
}

export function emptyBranchForm(): BranchFormState {
  return {
    code: '',
    name: '',
    phone: '',
    email: '',
    provinceCode: '',
    wardCode: '',
    addressLine: '',
    latitude: '',
    longitude: '',
    isActive: true,
  }
}

export function branchToForm(branch: OrganizationBranch): BranchFormState {
  return {
    code: branch.code,
    name: branch.name,
    phone: branch.phone || '',
    email: branch.email || '',
    provinceCode: branch.province_code,
    wardCode: branch.ward_code,
    addressLine: branch.address_line,
    latitude: branch.location ? String(branch.location.latitude) : '',
    longitude: branch.location ? String(branch.location.longitude) : '',
    isActive: branch.is_active,
  }
}

export function emptyServiceForm(): ServiceFormState {
  return {
    code: '',
    name: '',
    description: '',
    durationMinutes: '30',
    bufferMinutes: '0',
    standardPrice: '',
    isActive: true,
  }
}

export function serviceToForm(service: {
  code: string
  name: string
  description: string | null
  standard_duration_minutes: number
  buffer_minutes: number
  standard_price: string
  is_active: boolean
}): ServiceFormState {
  return {
    code: service.code,
    name: service.name,
    description: service.description || '',
    durationMinutes: String(service.standard_duration_minutes),
    bufferMinutes: String(service.buffer_minutes),
    standardPrice: service.standard_price,
    isActive: service.is_active,
  }
}

export function emptyDentistForm(): DentistFormState {
  return { email: '', licenseNumber: '', biography: '' }
}

export function validateBranchForm(form: BranchFormState) {
  if (!form.code.trim()) return 'Vui lòng nhập mã chi nhánh.'
  if (!form.name.trim()) return 'Vui lòng nhập tên chi nhánh.'
  if (!form.provinceCode) return 'Vui lòng chọn tỉnh/thành.'
  if (!form.wardCode) return 'Vui lòng chọn phường/xã.'
  if (!form.addressLine.trim()) return 'Vui lòng nhập địa chỉ.'
  return validateCoordinates(form.latitude, form.longitude)
}

export function validateCoordinates(latitude: string, longitude: string) {
  const hasLatitude = latitude.trim() !== ''
  const hasLongitude = longitude.trim() !== ''
  if (!hasLatitude && !hasLongitude) {
    return 'Vui lòng nhập vĩ độ và kinh độ của chi nhánh.'
  }
  if (hasLatitude !== hasLongitude) {
    return 'Vĩ độ và kinh độ phải được nhập cùng nhau.'
  }
  const lat = Number(latitude)
  const lng = Number(longitude)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return 'Vĩ độ phải nằm trong khoảng -90 đến 90.'
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return 'Kinh độ phải nằm trong khoảng -180 đến 180.'
  }
  return ''
}

export function buildBranchInput(form: BranchFormState): OrganizationBranchInput {
  const error = validateBranchForm(form)
  if (error) throw new Error(error)
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    phone: form.phone.trim() || null,
    email: form.email.trim() || null,
    province_code: form.provinceCode,
    ward_code: form.wardCode,
    address_line: form.addressLine.trim(),
    latitude: Number(form.latitude),
    longitude: Number(form.longitude),
    is_active: form.isActive,
  }
}

export function validateServiceForm(form: ServiceFormState) {
  if (!form.code.trim()) return 'Vui lòng nhập mã dịch vụ.'
  if (!form.name.trim()) return 'Vui lòng nhập tên dịch vụ.'
  const duration = Number(form.durationMinutes)
  if (!Number.isInteger(duration) || duration < 1) {
    return 'Thời lượng chuẩn phải là số nguyên lớn hơn 0.'
  }
  const buffer = Number(form.bufferMinutes)
  if (!Number.isInteger(buffer) || buffer < 0) {
    return 'Thời gian đệm phải là số nguyên không âm.'
  }
  if (!form.standardPrice.trim()) {
    return 'Vui lòng nhập giá chuẩn.'
  }
  const price = Number(form.standardPrice)
  if (!Number.isFinite(price) || price < 0) {
    return 'Giá chuẩn phải là số không âm.'
  }
  return ''
}

export function buildServiceInput(form: ServiceFormState): OrganizationServiceInput {
  const error = validateServiceForm(form)
  if (error) throw new Error(error)
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    description: form.description.trim() || null,
    standard_duration_minutes: Number(form.durationMinutes),
    buffer_minutes: Number(form.bufferMinutes),
    standard_price: String(Number(form.standardPrice)),
    is_active: form.isActive,
  }
}

export function validateDentistForm(form: DentistFormState) {
  if (!form.email.trim()) return 'Vui lòng nhập email nha sĩ.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return 'Email nha sĩ không hợp lệ.'
  }
  return ''
}

export function buildDentistInput(form: DentistFormState): OrganizationDentistInput {
  const error = validateDentistForm(form)
  if (error) throw new Error(error)
  return {
    email: form.email.trim(),
    license_number: form.licenseNumber.trim() || null,
    biography: form.biography.trim() || null,
  }
}

export function validateMembershipInvite(input: {
  email: string
  role: 'ORGANIZATION_ADMIN' | 'BRANCH_ADMIN'
  branchId: string
}) {
  if (!input.email.trim()) return 'Vui lòng nhập email.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    return 'Email không hợp lệ.'
  }
  if (input.role === 'BRANCH_ADMIN' && !input.branchId) {
    return 'Quản lý chi nhánh phải được gắn với một chi nhánh.'
  }
  return ''
}
