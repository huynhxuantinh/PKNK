import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BranchReportDashboard } from './BranchReportDashboard'
import { formatVnd, validateReportDateRange } from './branchReportPresentation'

describe('branch report dashboard', () => {
  it('formats decimal money as Vietnamese currency', () => {
    expect(formatVnd('12345.00')).toBe('12.345 ₫')
  })

  it('rejects a report range whose start date is after its end date', () => {
    expect(validateReportDateRange('2026-10-25', '2026-10-24')).toBe(
      'Từ ngày không được sau đến ngày.',
    )
    expect(validateReportDateRange('2026-10-24', '2026-10-24')).toBe('')
  })

  it('renders daily revenue returned by the backend', () => {
    const markup = renderToStaticMarkup(<BranchReportDashboard data={{
      revenue: { total_revenue: '12345.00', paid_invoice_count: 1, by_period: [{ period_start: '2026-10-24', revenue: '12345.00', paid_invoice_count: 1 }] },
      appointments: { total_appointments: 2, completed_count: 1, cancellation_rate_percent: '0.00', no_show_rate_percent: '0.00' },
      chairs: { utilization_rate_percent: '25.00', occupied_minutes: 60 },
    }} />)

    expect(markup).toContain('Doanh thu theo ngày')
    expect(markup).toContain('24/10/2026')
    expect(markup).toContain('12.345 ₫')
    expect(markup).not.toContain('12345.00')
  })
})
