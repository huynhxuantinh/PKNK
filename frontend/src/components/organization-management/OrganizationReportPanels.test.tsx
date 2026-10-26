import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type {
  AppointmentReport,
  ChairUtilizationReport,
  RevenueReport,
} from '../../api/organization'
import { OrganizationBranchComparisonTable } from './OrganizationReportPanels'

const revenue = {
  scope: 'ORGANIZATION',
  date_from: '2026-10-01',
  date_to: '2026-10-26',
  timezone: 'Asia/Ho_Chi_Minh',
  currency: 'VND',
  interval: 'DAY',
  total_revenue: '1290000.00',
  paid_invoice_count: 6,
  by_branch: [
    {
      branch_id: 2,
      branch_name: 'Mỹ Đình',
      revenue: '900000.00',
      paid_invoice_count: 2,
    },
  ],
  by_service: [],
  by_period: [],
} as RevenueReport

const appointments = {
  scope: 'ORGANIZATION',
  date_from: '2026-10-01',
  date_to: '2026-10-26',
  timezone: 'Asia/Ho_Chi_Minh',
  total_appointments: 4,
  completed_count: 3,
  cancelled_count: 1,
  no_show_count: 0,
  cancellation_rate_percent: '25.00',
  no_show_rate_percent: '0.00',
  by_branch: [{
    branch_id: 2,
    branch_name: 'Mỹ Đình',
    total_appointments: 4,
    completed_count: 3,
    cancelled_count: 1,
    no_show_count: 0,
    cancellation_rate_percent: '25.00',
    no_show_rate_percent: '0.00',
  }],
} as AppointmentReport

const chairs = {
  scope: 'ORGANIZATION',
  date_from: '2026-10-01',
  date_to: '2026-10-26',
  timezone: 'Asia/Ho_Chi_Minh',
  included_statuses: [],
  total_chairs: 3,
  available_minutes: 7200,
  occupied_minutes: 3600,
  utilization_rate_percent: '50.00',
  by_branch: [{
    branch_id: 2,
    branch_name: 'Mỹ Đình',
    chair_count: 3,
    open_days: 20,
    available_minutes: 7200,
    occupied_minutes: 3600,
    utilization_rate_percent: '50.00',
    by_chair: [],
  }],
} as ChairUtilizationReport

describe('organization branch comparison table', () => {
  it('merges branch metrics and links to the branch report', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <OrganizationBranchComparisonTable
          revenue={revenue}
          appointments={appointments}
          chairs={chairs}
        />
      </MemoryRouter>,
    )

    expect(markup).toContain('Mỹ Đình')
    expect(markup).toContain('900.000 ₫')
    expect(markup).toContain('25%')
    expect(markup).toContain('50%')
    expect(markup).toContain('/quan-ly-chi-nhanh/bao-cao?chi-nhanh=2')
  })
})
