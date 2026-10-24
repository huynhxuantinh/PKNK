import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  BranchChairList,
  BranchHolidayList,
  BranchServiceList,
  OpeningHoursEditor,
} from './BranchConfigurationSections'
import { buildHolidayPayload } from './branchConfigurationPresentation'

describe('branch configuration sections', () => {
  it('renders all seven opening-hour rows and save action', () => {
    const hours = Array.from({ length: 7 }, (_, index) => ({ weekday: index + 1, is_closed: index === 6, open_time: index === 6 ? null : '08:00', close_time: index === 6 ? null : '18:00' }))
    const markup = renderToStaticMarkup(<OpeningHoursEditor items={hours} canEdit busy={false} onChange={() => {}} onSave={() => {}} />)
    expect(markup.match(/config-opening-row/g)?.length).toBe(7)
    expect(markup).toContain('Lưu giờ mở cửa')
    expect(markup).toContain('Chủ nhật')
  })

  it('renders chair, service and holiday management actions', () => {
    const chairMarkup = renderToStaticMarkup(<BranchChairList items={[{ id_chair: 1, branch_id: 5, code: 'C01', name: 'Ghế 01', resource_type: 'CHAIR', is_active: true }]} onEdit={() => {}} onToggle={() => {}} />)
    const serviceMarkup = renderToStaticMarkup(<BranchServiceList items={[{ id_branch_service: 2, branch_id: 5, service_id: 3, service_name: 'Khám tổng quát', price: '500000', duration_minutes: 30, buffer_minutes: 5, is_active: true }]} onEdit={() => {}} onToggle={() => {}} />)
    const holidayMarkup = renderToStaticMarkup(<BranchHolidayList items={[{ id_holiday: 4, organization_id: 1, branch_id: 5, holiday_date: '2026-12-31', name: 'Nghỉ cuối năm', is_closed: true }]} canEdit onEdit={() => {}} onDelete={() => {}} />)
    expect(chairMarkup).toContain('Ngừng sử dụng')
    expect(serviceMarkup).toContain('500.000')
    expect(holidayMarkup).toContain('Xóa')
  })

  it('preserves organization-wide scope when editing a holiday', () => {
    const form = {
      holiday_date: '2026-12-31',
      name: 'Nghỉ cuối năm',
      is_closed: true,
    }

    expect(buildHolidayPayload(5, form, { branch_id: null }).branch_id).toBeNull()
    expect(buildHolidayPayload(5, form, { branch_id: 3 }).branch_id).toBe(3)
    expect(buildHolidayPayload(5, form, null).branch_id).toBe(5)
  })
})
