import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Appointment, Branch, BranchDentist, BranchDetail, BranchService, Slot } from '../../types/api'
import {
  BOOKING_DRAFT_STORAGE_KEY,
  bookingIdempotencyKey,
  bookingSelectionReducer,
  branchFromDetail,
  clearBookingAttempt,
  clearBookingHold,
  clearBookingHoldCaches,
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

describe('bookingIdempotencyKey', () => {
  beforeEach(() => sessionStorageMock.clear())

  it('dùng lại khóa khi thử lại cùng một lựa chọn đặt lịch', () => {
    const createKey = vi.fn(() => 'key-first-attempt')
    const fingerprint = '10|2026-10-10T09:00:00+07:00|20'

    const first = bookingIdempotencyKey(12, fingerprint, createKey)
    const retry = bookingIdempotencyKey(12, fingerprint, createKey)

    expect(first).toBe('key-first-attempt')
    expect(retry).toBe(first)
    expect(createKey).toHaveBeenCalledTimes(1)
  })

  it('tạo khóa mới khi người bệnh đổi khung giờ hoặc bác sĩ', () => {
    const keys = ['key-first-attempt', 'key-second-attempt']
    const createKey = vi.fn(() => keys.shift() ?? 'key-fallback')

    bookingIdempotencyKey(12, '10|2026-10-10T09:00:00+07:00|20', createKey)
    const changed = bookingIdempotencyKey(12, '10|2026-10-10T10:00:00+07:00|20', createKey)

    expect(changed).toBe('key-second-attempt')
    expect(createKey).toHaveBeenCalledTimes(2)
  })

  it('tách khóa theo tài khoản để không dùng chung giữa hai người bệnh', () => {
    const first = bookingIdempotencyKey(12, 'same-selection', () => 'key-patient-12')
    const second = bookingIdempotencyKey(13, 'same-selection', () => 'key-patient-13')

    expect(first).toBe('key-patient-12')
    expect(second).toBe('key-patient-13')
  })

  it('xóa khóa thử lại khi chỗ giữ đã được xác nhận hoặc hủy', () => {
    const fingerprint = '10|2026-10-10T09:00:00+07:00|20'
    bookingIdempotencyKey(12, fingerprint, () => 'key-first-attempt')

    clearBookingAttempt(12)

    expect(bookingIdempotencyKey(12, fingerprint, () => 'key-next-attempt')).toBe('key-next-attempt')
  })

  it('xóa toàn bộ bộ nhớ đệm chỗ giữ và khóa thử lại khi đăng xuất', () => {
    const fingerprint = '10|2026-10-10T09:00:00+07:00|20'
    storeBookingHold(12, heldAppointment)
    bookingIdempotencyKey(12, fingerprint, () => 'key-first-attempt')

    clearBookingHoldCaches()

    expect(restoreBookingHold(12, new Date('2026-10-10T09:55:00+07:00').getTime())).toBeNull()
    expect(bookingIdempotencyKey(12, fingerprint, () => 'key-next-attempt')).toBe('key-next-attempt')
  })
})

describe('branchFromDetail', () => {
  const detail = {
    id_branch: 5,
    code: 'Q5',
    name: 'PKNK Dental An Đông',
    phone: '028 7300 1005',
    email: 'q5@demo.pknk.vn',
    province_code: '79',
    province_name: 'Thành phố Hồ Chí Minh',
    ward_code: '27316',
    ward_name: 'Phường An Đông',
    address_line: '412 Nguyễn Trãi',
    full_address: '412 Nguyễn Trãi, Phường An Đông, Thành phố Hồ Chí Minh',
    location: { latitude: 10.7544, longitude: 106.6692 },
    opening_hours: [
      {
        weekday: 2,
        weekday_label: 'Thứ ba',
        is_closed: false,
        open_time: '08:00:00',
        close_time: '18:00:00',
      },
      {
        weekday: 3,
        weekday_label: 'Thứ tư',
        is_closed: true,
        open_time: null,
        close_time: null,
      },
    ],
    images: [
      { id_branch_image: 1, storage_key: '/images/secondary.jpg', original_name: 'secondary.jpg', mime_type: 'image/jpeg', is_primary: false, sort_order: 1 },
      { id_branch_image: 2, storage_key: '/images/primary.jpg', original_name: 'primary.jpg', mime_type: 'image/jpeg', is_primary: true, sort_order: 0 },
    ],
    services: [],
    dentists: [],
  } as unknown as BranchDetail

  it('dựng chi nhánh từ API chi tiết và chọn đúng ảnh đại diện', () => {
    const branch = branchFromDetail(detail, new Date('2026-11-03T02:00:00Z'))

    expect(branch).toEqual({
      id_branch: 5,
      code: 'Q5',
      name: 'PKNK Dental An Đông',
      phone: '028 7300 1005',
      province_code: '79',
      province_name: 'Thành phố Hồ Chí Minh',
      ward_code: '27316',
      ward_name: 'Phường An Đông',
      address_line: '412 Nguyễn Trãi',
      full_address: '412 Nguyễn Trãi, Phường An Đông, Thành phố Hồ Chí Minh',
      location: { latitude: 10.7544, longitude: 106.6692 },
      distance_km: null,
      is_open_now: true,
      primary_image: detail.images[1],
    })
  })

  it('đánh dấu đóng cửa ngoài giờ mở cửa hoặc vào ngày nghỉ', () => {
    expect(branchFromDetail(detail, new Date('2026-11-03T02:00:00Z')).is_open_now).toBe(true)
    expect(branchFromDetail(detail, new Date('2026-11-03T12:00:00Z')).is_open_now).toBe(false)
    expect(branchFromDetail(detail, new Date('2026-11-04T02:00:00Z')).is_open_now).toBe(false)
  })
})
