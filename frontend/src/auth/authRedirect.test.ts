import { describe, expect, it } from 'vitest'

import { safeReturnPath } from './authRedirect'

import { destinationAfterLogin } from './authRedirect'
import type { User } from '../types/api'

describe('safeReturnPath', () => {
  it('routes dentist accounts to the dentist dashboard', () => {
    const dentist = {
      id_user: 2,
      email: 'dentist@example.com',
      full_name: 'Dentist Demo',
      email_verified: true,
      email_verified_at: '2026-10-22T00:00:00Z',
      memberships: [{
        role: 'DENTIST',
        organization_id: 1,
        organization_name: 'DentaVie',
        branch_id: 1,
        branch_name: 'Branch 1',
      }],
    } satisfies User

    expect(destinationAfterLogin(dentist, '/dat-lich?chi-nhanh=5')).toBe('/bac-si/chon-chi-nhanh')
  })

  it('routes branch managers to the branch management dashboard', () => {
    const manager = {
      id_user: 4,
      email: 'manager@example.com',
      full_name: 'Branch Manager',
      email_verified: true,
      email_verified_at: '2026-10-22T00:00:00Z',
      memberships: [{
        role: 'BRANCH_ADMIN',
        organization_id: 1,
        organization_name: 'DentaVie',
        branch_id: 1,
        branch_name: 'Branch 1',
      }],
    } satisfies User

    expect(destinationAfterLogin(manager)).toBe('/quan-ly-chi-nhanh')
  })

  it('routes patient accounts to the home page after a direct login', () => {
    const patient = {
      id_user: 3,
      email: 'patient@example.com',
      full_name: 'Patient Demo',
      email_verified: true,
      email_verified_at: '2026-10-22T00:00:00Z',
      memberships: [{
        role: 'PATIENT',
        organization_id: 1,
        organization_name: 'DentaVie',
        branch_id: null,
        branch_name: null,
      }],
    } satisfies User

    expect(destinationAfterLogin(patient)).toBe('/')
    expect(destinationAfterLogin(patient, '/bac-si')).toBe('/')
  })

  it('giữ lại đường dẫn nội bộ của trang chi tiết chi nhánh', () => {
    expect(safeReturnPath('/chi-nhanh/12')).toBe('/chi-nhanh/12')
  })

  it('giữ lại query và hash của đường dẫn nội bộ', () => {
    expect(safeReturnPath('/chi-nhanh/12?tab=dich-vu#bac-si')).toBe('/chi-nhanh/12?tab=dich-vu#bac-si')
  })

  it('không cho chuyển hướng tới URL bên ngoài', () => {
    expect(safeReturnPath('https://example.com')).toBe('/')
    expect(safeReturnPath('//example.com')).toBe('/')
  })

  it('trả về trang chủ khi không có đường dẫn', () => {
    expect(safeReturnPath(null)).toBe('/')
  })
})
