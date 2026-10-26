import { describe, expect, it } from 'vitest'

import {
  buildBranchInput,
  buildDentistInput,
  buildServiceInput,
  emptyBranchForm,
  emptyServiceForm,
  validateBranchForm,
  validateCoordinates,
  validateDentistForm,
  validateMembershipInvite,
  validateServiceForm,
} from './organizationValidation'

describe('branch form validation', () => {
  it('requires latitude and longitude together', () => {
    expect(validateCoordinates('', '')).toBe(
      'Vui lòng nhập vĩ độ và kinh độ của chi nhánh.',
    )
    expect(validateCoordinates('21.02', '')).toBe(
      'Vĩ độ và kinh độ phải được nhập cùng nhau.',
    )
    expect(validateCoordinates('', '105.8')).toBe(
      'Vĩ độ và kinh độ phải được nhập cùng nhau.',
    )
  })

  it('checks coordinate ranges', () => {
    expect(validateCoordinates('91', '105.8')).toBe(
      'Vĩ độ phải nằm trong khoảng -90 đến 90.',
    )
    expect(validateCoordinates('21.02', '181')).toBe(
      'Kinh độ phải nằm trong khoảng -180 đến 180.',
    )
    expect(validateCoordinates('21.02', '105.8')).toBe('')
  })

  it('requires the address fields and builds a trimmed payload', () => {
    const form = {
      ...emptyBranchForm(),
      code: '  AN-KHANH ',
      name: ' An Khánh ',
      provinceCode: '01',
      wardCode: '00001',
      addressLine: ' Số 1 ',
      latitude: '21.02',
      longitude: '105.8',
    }
    expect(validateBranchForm(emptyBranchForm())).toBe('Vui lòng nhập mã chi nhánh.')
    expect(buildBranchInput(form)).toMatchObject({
      code: 'AN-KHANH',
      name: 'An Khánh',
      address_line: 'Số 1',
      latitude: 21.02,
      longitude: 105.8,
    })
  })
})

describe('service form validation', () => {
  const valid = {
    ...emptyServiceForm(),
    code: 'SV-01',
    name: 'Cạo vôi',
    durationMinutes: '30',
    bufferMinutes: '5',
    standardPrice: '350000',
  }

  it('rejects non-positive durations and negative prices', () => {
    expect(validateServiceForm({ ...valid, durationMinutes: '0' })).toBe(
      'Thời lượng chuẩn phải là số nguyên lớn hơn 0.',
    )
    expect(validateServiceForm({ ...valid, bufferMinutes: '-1' })).toBe(
      'Thời gian đệm phải là số nguyên không âm.',
    )
    expect(validateServiceForm({ ...valid, standardPrice: '-5' })).toBe(
      'Giá chuẩn phải là số không âm.',
    )
    expect(validateServiceForm({ ...valid, standardPrice: '  ' })).toBe(
      'Vui lòng nhập giá chuẩn.',
    )
  })

  it('normalises the decimal price string', () => {
    expect(buildServiceInput({ ...valid, standardPrice: '350000.00' })).toMatchObject({
      code: 'SV-01',
      standard_duration_minutes: 30,
      buffer_minutes: 5,
      standard_price: '350000',
    })
  })
})

describe('dentist and membership validation', () => {
  it('requires a valid dentist email', () => {
    expect(validateDentistForm({ email: '', licenseNumber: '', biography: '' })).toBe(
      'Vui lòng nhập email nha sĩ.',
    )
    expect(validateDentistForm({ email: 'bad', licenseNumber: '', biography: '' })).toBe(
      'Email nha sĩ không hợp lệ.',
    )
    expect(buildDentistInput({
      email: ' dentist@example.com ',
      licenseNumber: ' 123 ',
      biography: '',
    })).toEqual({
      email: 'dentist@example.com',
      license_number: '123',
      biography: null,
    })
  })

  it('requires a branch only for branch administrators', () => {
    expect(validateMembershipInvite({
      email: 'admin@example.com',
      role: 'ORGANIZATION_ADMIN',
      branchId: '',
    })).toBe('')
    expect(validateMembershipInvite({
      email: 'admin@example.com',
      role: 'BRANCH_ADMIN',
      branchId: '',
    })).toBe('Quản lý chi nhánh phải được gắn với một chi nhánh.')
  })
})
