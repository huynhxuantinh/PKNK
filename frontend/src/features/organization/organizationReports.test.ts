import { describe, expect, it } from 'vitest'

import {
  defaultOrganizationReportRange,
  buildBranchComparisonRows,
  formatMinutes,
  inclusiveDayCount,
  validateOrganizationReportRange,
} from './organizationReports'
import type {
  AppointmentReport,
  ChairUtilizationReport,
  RevenueReport,
} from '../../api/organization'

describe('organization report range', () => {
  it('defaults to the last 30 days in Vietnam time', () => {
    const range = defaultOrganizationReportRange(new Date('2026-10-26T03:00:00Z'))
    expect(range).toEqual({ from: '2026-09-27', to: '2026-10-26' })
    expect(inclusiveDayCount(range.from, range.to)).toBe(30)
  })

  it('rejects inverted ranges and ranges longer than 366 days', () => {
    expect(validateOrganizationReportRange('2026-10-25', '2026-10-24')).toBe(
      'Từ ngày không được sau đến ngày.',
    )
    expect(validateOrganizationReportRange('2025-10-01', '2026-10-02')).toBe(
      'Khoảng báo cáo tối đa 366 ngày.',
    )
    expect(validateOrganizationReportRange('2026-10-01', '2026-10-31')).toBe('')
  })
})

describe('buildBranchComparisonRows', () => {
  it('merges revenue, appointment and chair metrics by branch', () => {
    const revenue = {
      by_branch: [
        { branch_id: 1, branch_name: 'An Khánh', revenue: '400000.00', paid_invoice_count: 4 },
        { branch_id: 2, branch_name: 'Mỹ Đình', revenue: '900000.00', paid_invoice_count: 2 },
      ],
    } as RevenueReport
    const appointments = {
      by_branch: [
        {
          branch_id: 1,
          branch_name: 'An Khánh',
          total_appointments: 6,
          completed_count: 5,
          cancelled_count: 1,
          no_show_count: 0,
          cancellation_rate_percent: '16.67',
          no_show_rate_percent: '0.00',
        },
      ],
    } as AppointmentReport
    const chairs = {
      by_branch: [
        {
          branch_id: 2,
          branch_name: 'Mỹ Đình',
          chair_count: 3,
          open_days: 20,
          available_minutes: 7200,
          occupied_minutes: 3600,
          utilization_rate_percent: '50.00',
          by_chair: [],
        },
      ],
    } as unknown as ChairUtilizationReport

    const rows = buildBranchComparisonRows(revenue, appointments, chairs)

    expect(rows.map((row) => row.branchId)).toEqual([2, 1])
    expect(rows[0]).toMatchObject({
      branchName: 'Mỹ Đình',
      revenue: '900000.00',
      chairCount: 3,
      chairUtilizationPercent: '50.00',
    })
    expect(rows[1]).toMatchObject({
      totalAppointments: 6,
      completedCount: 5,
      cancellationRatePercent: '16.67',
    })
  })

  it('falls back to a stable branch label when no source has a name', () => {
    const rows = buildBranchComparisonRows(null, null, {
      by_branch: [{
        branch_id: 9,
        branch_name: '',
        chair_count: 1,
        open_days: 0,
        available_minutes: 0,
        occupied_minutes: 0,
        utilization_rate_percent: '0.00',
        by_chair: [],
      }],
    } as unknown as ChairUtilizationReport)
    expect(rows[0].branchName).toBe('Chi nhánh #9')
  })
})

describe('formatMinutes', () => {
  it('formats minutes as hours and minutes', () => {
    expect(formatMinutes(0)).toBe('0 phút')
    expect(formatMinutes(45)).toBe('45 phút')
    expect(formatMinutes(60)).toBe('1 giờ')
    expect(formatMinutes(135)).toBe('2 giờ 15 phút')
  })
})
