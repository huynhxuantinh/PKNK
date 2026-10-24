export interface RevenuePeriodReport {
  period_start: string
  revenue: string | number
  paid_invoice_count: number
}

export interface BranchReportData {
  revenue: {
    total_revenue: string | number
    paid_invoice_count: number
    by_period: RevenuePeriodReport[]
  }
  appointments: {
    total_appointments: number
    completed_count: number
    cancellation_rate_percent: string | number
    no_show_rate_percent: string | number
  }
  chairs: {
    utilization_rate_percent: string | number
    occupied_minutes: number
  }
}

const numberFormatter = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 0,
})

const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
})

export function formatVnd(value: string | number) {
  const amount = Number(value)
  return Number.isFinite(amount) ? `${numberFormatter.format(amount)} ₫` : '—'
}

export function formatReportDate(value: string) {
  const date = new Date(`${value}T00:00:00+07:00`)
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date)
}

export function formatPercent(value: string | number) {
  const percentage = Number(value)
  return Number.isFinite(percentage)
    ? `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(percentage)}%`
    : '—'
}
