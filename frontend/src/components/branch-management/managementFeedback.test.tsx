import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ManagementErrorBanner } from './AppointmentList'
import { RescheduleSlotResults } from './RescheduleAppointmentModal'

describe('branch management feedback', () => {
  it('announces when no reschedule slots are available', () => {
    const markup = renderToStaticMarkup(
      <RescheduleSlotResults slots={[]} busy={false} reason="Đổi giờ" onSelect={() => {}} />,
    )

    expect(markup).toContain('Không có giờ trống phù hợp')
    expect(markup).toContain('role="status"')
  })

  it('exposes management errors as alerts', () => {
    const markup = renderToStaticMarkup(<ManagementErrorBanner message="Không thể tải lịch" />)

    expect(markup).toContain('role="alert"')
  })
})
