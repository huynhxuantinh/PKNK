import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Appointment, Branch, BranchDentist, BranchService, Slot } from '../../types/api'
import {
  BOOKING_DRAFT_STORAGE_KEY,
  bookingSelectionReducer,
  clearBookingHold,
  dateInputValue,
  initialBookingSelection,
  restoreBookingHold,
  storeBookingHold,
  type BookingSelection,
} from './bookingState'

const branch = { id_branch: 1, name: 'Quận 1' } as Branch
const nextBranch = { id_branch: 2, name: 'Quận 3' } as Branch
const service = { id_branch_service: 10, name: 'Cạo vôi' } as BranchService
const slot = { starts_at: '2026-10-10T09:00:00+07:00' } as Slot
const dentist = { id_dentist: 20, full_name: 'BS. Nguyễn Minh' } as BranchDentist

const selected: BookingSelection = {
  branch,
  service,
  date: '2026-10-10',
  slot,
  dentist,
}

const heldAppointment = {
  public_code: 'APT-HELD-001',
  status: 'HELD',
  expires_at: '2026-10-10T10:00:00+07:00',
} as Appointment

const sessionEntries = new Map<string, string>()
const sessionStorageMock = {
  get length() { return sessionEntries.size },
  clear: () => sessionEntries.clear(),
  getItem: (key: string) => sessionEntries.get(key) ?? null,
  key: (index: number) => Array.from(sessionEntries.keys())[index] ?? null,
  removeItem: (key: string) => sessionEntries.delete(key),
  setItem: (key: string, value: string) => sessionEntries.set(key, value),
}
vi.stubGlobal('sessionStorage', sessionStorageMock)

describe('bookingSelectionReducer', () => {
  beforeEach(() => sessionStorageMock.clear())

  it('dùng ngày tại Thành phố Hồ Chí Minh, không theo múi giờ trình duyệt', () => {
    const moment = new Date('2026-10-23T18:00:00.000Z')

    expect(dateInputValue(0, moment)).toBe('2026-10-24')
    expect(dateInputValue(1, moment)).toBe('2026-10-25')
  })

  it('xóa dịch vụ và slot khi đổi chi nhánh', () => {
    const result = bookingSelectionReducer(selected, {
      type: 'select_branch',
      branch: nextBranch,
    })

    expect(result.branch).toBe(nextBranch)
    expect(result.service).toBeNull()
    expect(result.slot).toBeNull()
    expect(result.dentist).toBeNull()
  })

  it('giữ nguyên bản nháp khi URL chọn lại đúng chi nhánh hiện tại', () => {
    const refreshedBranch = { ...branch, name: 'Chi nhánh đã tải lại' }

    const result = bookingSelectionReducer(selected, {
      type: 'select_branch',
      branch: refreshedBranch,
    })

    expect(result.branch).toBe(refreshedBranch)
    expect(result.service).toBe(service)
    expect(result.date).toBe(selected.date)
    expect(result.slot).toBe(slot)
    expect(result.dentist).toBe(dentist)
  })

  it('xóa slot khi đổi dịch vụ hoặc ngày', () => {
    const afterService = bookingSelectionReducer(selected, {
      type: 'select_service',
      service,
    })
    const afterDate = bookingSelectionReducer(selected, {
      type: 'select_date',
      date: '2026-10-11',
    })

    expect(afterService.slot).toBeNull()
    expect(afterService.dentist).toBeNull()
    expect(afterDate.slot).toBeNull()
    expect(afterDate.dentist).toBeNull()
  })

  it('xóa bác sĩ khi đổi khung giờ và lưu bác sĩ được chọn', () => {
    const nextSlot = { starts_at: '2026-10-10T10:00:00+07:00' } as Slot
    const afterSlot = bookingSelectionReducer(selected, {
      type: 'select_slot',
      slot: nextSlot,
    })
    const afterDentist = bookingSelectionReducer(afterSlot, {
      type: 'select_dentist',
      dentist,
    })

    expect(afterSlot.dentist).toBeNull()
    expect(afterDentist.dentist).toBe(dentist)
  })

  it('reset xóa toàn bộ lựa chọn thay vì đọc lại bản nháp', () => {
    const result = bookingSelectionReducer(selected, { type: 'reset' })

    expect(result.branch).toBeNull()
    expect(result.service).toBeNull()
    expect(result.slot).toBeNull()
    expect(result.dentist).toBeNull()
  })

  it('khôi phục bản nháp chỉ giữ chi nhánh và ngày hợp lệ, bỏ slot và bác sĩ cũ', () => {
    const date = dateInputValue(1)
    sessionStorageMock.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify({
      ...selected,
      date,
    }))

    expect(initialBookingSelection()).toEqual({
      branch,
      service: null,
      date,
      slot: null,
      dentist: null,
    })
  })

  it('khôi phục chỗ đang giữ đúng tài khoản khi trang được tải lại', () => {
    storeBookingHold(12, heldAppointment)

    expect(restoreBookingHold(12, new Date('2026-10-10T09:55:00+07:00').getTime())).toEqual(heldAppointment)
    expect(restoreBookingHold(13, new Date('2026-10-10T09:55:00+07:00').getTime())).toBeNull()
  })

  it('xóa chỗ giữ đã hết hạn thay vì khôi phục lại', () => {
    storeBookingHold(12, heldAppointment)

    expect(restoreBookingHold(12, new Date('2026-10-10T10:00:00+07:00').getTime())).toBeNull()
    expect(restoreBookingHold(12, new Date('2026-10-10T09:55:00+07:00').getTime())).toBeNull()
    clearBookingHold(12)
  })
})
