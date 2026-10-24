import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  StaffTimeOffList,
  StaffWorkShiftList,
} from './StaffScheduleList'
import { toHcmLocalInput } from './staffSchedulePresentation'

const dentists = [{ id_dentist: 7, full_name: 'BS. Lê Quốc Huy' }]

describe('staff schedule management UI', () => {
  it('renders edit and deactivate actions for an active work shift', () => {
    const markup = renderToStaticMarkup(
      <StaffWorkShiftList
        dentists={dentists}
        items={[{
          id_work_shift: 1,
          branch_id: 2,
          dentist_id: 7,
          weekday: 1,
          start_time: '08:00:00',
          end_time: '17:00:00',
          valid_from: '2026-10-24',
          valid_to: null,
          is_active: true,
        }]}
        busyId={null}
        onEdit={() => {}}
        onToggle={() => {}}
      />,
    )

    expect(markup).toContain('Chỉnh sửa')
    expect(markup).toContain('Ngừng áp dụng')
    expect(markup).toContain('Đang áp dụng')
  })

  it('renders edit and delete actions for an active time off', () => {
    const markup = renderToStaticMarkup(
      <StaffTimeOffList
        dentists={dentists}
        items={[{
          id_time_off: 3,
          branch_id: 2,
          dentist_id: 7,
          starts_at: '2026-10-25T01:00:00Z',
          ends_at: '2026-10-25T05:00:00Z',
          reason: 'Nghỉ phép',
          is_active: true,
        }]}
        busyId={null}
        onEdit={() => {}}
        onToggle={() => {}}
      />,
    )

    expect(markup).toContain('Chỉnh sửa')
    expect(markup).toContain('Xóa lịch nghỉ')
    expect(markup).toContain('Nghỉ phép')
  })

  it('converts API timestamps to Ho Chi Minh datetime-local values', () => {
    expect(toHcmLocalInput('2026-10-25T01:30:00Z')).toBe('2026-10-25T08:30')
  })
})
