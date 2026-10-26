import type {
  AppointmentReport,
  ChairUtilizationReport,
  RevenueReport,
} from '../../api/organization'
import { validateReportDateRange } from '../../components/branch-management/branchReportPresentation'

export const ORGANIZATION_REPORT_MAX_DAYS = 366

function hcmIsoDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function defaultOrganizationReportRange(now = new Date()) {
  return {
    from: hcmIsoDate(new Date(now.getTime() - 29 * 86400000)),
    to: hcmIsoDate(now),
  }
}

export function inclusiveDayCount(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00+07:00`)
  const end = Date.parse(`${to}T00:00:00+07:00`)
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.floor((end - start) / 86400000) + 1
}

export function validateOrganizationReportRange(from: string, to: string) {
  const baseError = validateReportDateRange(from, to)
  if (baseError) return baseError
  if (inclusiveDayCount(from, to) > ORGANIZATION_REPORT_MAX_DAYS) {
    return 'Khoảng báo cáo tối đa 366 ngày.'
  }
  return ''
}

export interface BranchComparisonRow {
  branchId: number
  branchName: string
  revenue: string | number
  paidInvoiceCount: number
  totalAppointments: number
  completedCount: number
  cancellationRatePercent: string | number
  noShowRatePercent: string | number
  chairCount: number
  chairUtilizationPercent: string | number
}

export function buildBranchComparisonRows(
  revenue: RevenueReport | null,
  appointments: AppointmentReport | null,
  chairs: ChairUtilizationReport | null,
): BranchComparisonRow[] {
  const rows = new Map<number, BranchComparisonRow>()

  function row(branchId: number, branchName: string) {
    const existing = rows.get(branchId)
    if (existing) {
      if (branchName) existing.branchName = branchName
      return existing
    }
    const created: BranchComparisonRow = {
      branchId,
      branchName: branchName || `Chi nhánh #${branchId}`,
      revenue: 0,
      paidInvoiceCount: 0,
      totalAppointments: 0,
      completedCount: 0,
      cancellationRatePercent: 0,
      noShowRatePercent: 0,
      chairCount: 0,
      chairUtilizationPercent: 0,
    }
    rows.set(branchId, created)
    return created
  }

  revenue?.by_branch.forEach((item) => {
    const target = row(item.branch_id, item.branch_name)
    target.revenue = item.revenue
    target.paidInvoiceCount = item.paid_invoice_count
  })
  appointments?.by_branch.forEach((item) => {
    const target = row(item.branch_id, item.branch_name)
    target.totalAppointments = item.total_appointments
    target.completedCount = item.completed_count
    target.cancellationRatePercent = item.cancellation_rate_percent
    target.noShowRatePercent = item.no_show_rate_percent
  })
  chairs?.by_branch.forEach((item) => {
    const target = row(item.branch_id, item.branch_name)
    target.chairCount = item.chair_count
    target.chairUtilizationPercent = item.utilization_rate_percent
  })

  return Array.from(rows.values()).sort(
    (left, right) => Number(right.revenue) - Number(left.revenue),
  )
}

export function formatMinutes(value: number) {
  const minutes = Number(value)
  if (!Number.isFinite(minutes)) return '—'
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours <= 0) return `${remainder} phút`
  return remainder === 0 ? `${hours} giờ` : `${hours} giờ ${remainder} phút`
}

export interface OrganizationReportData {
  revenue: RevenueReport
  appointments: AppointmentReport
  chairs: ChairUtilizationReport
}
