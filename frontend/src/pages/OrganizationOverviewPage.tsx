import { useEffect, useState } from 'react'

import {
  organizationReport,
  type AppointmentReport,
  type ChairUtilizationReport,
  type RevenueReport,
} from '../api/organization'
import { OrganizationPageLayout } from '../components/organization-management/OrganizationPageLayout'
import {
  OrganizationBranchComparisonTable,
  OrganizationDailyRevenueTable,
  OrganizationReportSummary,
  OrganizationServiceRevenueTable,
} from '../components/organization-management/OrganizationReportPanels'
import { OrganizationSettingsPanel } from '../components/organization-management/OrganizationSettingsPanel'
import { useOrganizationScope } from '../components/organization-management/useOrganizationScope'
import {
  defaultOrganizationReportRange,
  type OrganizationReportData,
  validateOrganizationReportRange,
} from '../features/organization/organizationReports'

export function OrganizationOverviewPage() {
  const scope = useOrganizationScope()
  const [range, setRange] = useState(defaultOrganizationReportRange)
  const [data, setData] = useState<OrganizationReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const organizationName =
    scope.options.find((option) => option.id === scope.organizationId)?.name
    || 'Quản trị tổ chức'

  useEffect(() => {
    if (!scope.organizationId) return
    const rangeError = validateOrganizationReportRange(range.from, range.to)
    if (rangeError) {
      setLoading(false)
      setData(null)
      setError(rangeError)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setData(null)
    setError('')

    Promise.all([
      organizationReport(scope.organizationId, 'revenue', range.from, range.to, controller.signal) as Promise<{ data: RevenueReport }>,
      organizationReport(scope.organizationId, 'appointments', range.from, range.to, controller.signal) as Promise<{ data: AppointmentReport }>,
      organizationReport(scope.organizationId, 'chair-utilization', range.from, range.to, controller.signal) as Promise<{ data: ChairUtilizationReport }>,
    ])
      .then(([revenue, appointments, chairs]) => {
        if (controller.signal.aborted) return
        setData({
          revenue: revenue.data,
          appointments: appointments.data,
          chairs: chairs.data,
        })
      })
      .catch((caught) => {
        if (controller.signal.aborted) return
        setData(null)
        setError(caught instanceof Error ? caught.message : 'Không thể tải báo cáo tổ chức.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [scope.organizationId, range.from, range.to, reloadKey])

  return (
    <OrganizationPageLayout
      title="Quản trị tổ chức"
      path="/quan-ly-to-chuc"
      active="overview"
      organizationId={scope.organizationId}
      options={scope.options}
      onSelectOrganization={scope.selectOrganization}
      heroKicker="Điều hành toàn hệ thống"
      heroTitle={organizationName}
      heroDescription="Theo dõi doanh thu, lịch hẹn và hiệu suất ghế trên toàn bộ chi nhánh."
      heroAside={
        <div className="organization-date-range">
          <label>
            Từ ngày
            <input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))}
            />
          </label>
          <label>
            Đến ngày
            <input
              type="date"
              value={range.to}
              min={range.from}
              onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))}
            />
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={() => setReloadKey((current) => current + 1)}
          >
            {loading ? 'Đang tải...' : 'Xem báo cáo'}
          </button>
        </div>
      }
    >
      {error && <div className="dentist-error" role="alert">{error}</div>}
      {loading && (
        <p className="branch-report-loading" role="status" aria-live="polite">
          Đang tải báo cáo tổ chức...
        </p>
      )}

      {!loading && data && (
        <>
          <OrganizationReportSummary {...data} />
          <OrganizationBranchComparisonTable {...data} />
          <div className="organization-report-grid">
            <OrganizationServiceRevenueTable revenue={data.revenue} />
            <OrganizationDailyRevenueTable revenue={data.revenue} />
          </div>
        </>
      )}

      {scope.organizationId && (
        <OrganizationSettingsPanel organizationId={scope.organizationId} />
      )}
    </OrganizationPageLayout>
  )
}
