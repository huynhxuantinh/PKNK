import { describe, expect, it } from 'vitest'

import type { Branch, BranchDentist, BranchService, Slot } from '../../types/api'
import { bookingSelectionReducer, dateInputValue, type BookingSelection } from './bookingState'

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

describe('bookingSelectionReducer', () => {
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
})
