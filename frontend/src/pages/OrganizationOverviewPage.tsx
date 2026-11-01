import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  listOrganizationBranches,
  listOrganizationDentists,
  listOrganizationInvitations,
  listOrganizationMemberships,
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
import { useOrganizationScope } from '../components/organization-management/useOrganizationScope'
import {
  defaultOrganizationReportRange,
  organizationReportRange,
  type OrganizationReportData,
  validateOrganizationReportRange,
} from '../features/organization/organizationReports'

export function OrganizationOverviewPage() {
  const scope = useOrganizationScope()
  const [range, setRange] = useState(defaultOrganizationReportRange)
  const [appliedRange, setAppliedRange] = useState(defaultOrganizationReportRange)
  const [data, setData] = useState<OrganizationReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [network, setNetwork] = useState({ activeBranches: 0, activeDentists: 0, activeManagers: 0 })
  const [alerts, setAlerts] = useState({ missingManagers: [] as string[], failedInvitations: 0, expiredInvitations: 0 })
  const organizationName =
    scope.options.find((option) => option.id === scope.organizationId)?.name
    || 'Quản trị tổ chức'

  useEffect(() => {
    if (!scope.organizationId) return
    const rangeError = validateOrganizationReportRange(appliedRange.from, appliedRange.to)
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
      organizationReport(scope.organizationId, 'revenue', appliedRange.from, appliedRange.to, controller.signal) as Promise<{ data: RevenueReport }>,
      organizationReport(scope.organizationId, 'appointments', appliedRange.from, appliedRange.to, controller.signal) as Promise<{ data: AppointmentReport }>,
      organizationReport(scope.organizationId, 'chair-utilization', appliedRange.from, appliedRange.to, controller.signal) as Promise<{ data: ChairUtilizationReport }>,
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
  }, [scope.organizationId, appliedRange.from, appliedRange.to, reloadKey])

  useEffect(() => {
    if (!scope.organizationId) return
    const controller = new AbortController()
    Promise.all([
      listOrganizationBranches(scope.organizationId, controller.signal),
      listOrganizationDentists(scope.organizationId, controller.signal),
      listOrganizationMemberships(scope.organizationId, controller.signal),
      listOrganizationInvitations(scope.organizationId, controller.signal),
    ]).then(([branches, dentists, memberships, invitations]) => {
      if (controller.signal.aborted) return
      const activeBranchIds = branches.data.filter((branch) => branch.is_active).map((branch) => branch.id_branch)
      const managedBranchIds = new Set(memberships.data.filter((membership) => membership.is_active && membership.role === 'BRANCH_ADMIN' && membership.branch_id !== null).map((membership) => membership.branch_id))
      setNetwork({
        activeBranches: activeBranchIds.length,
        activeDentists: dentists.data.filter((dentist) => dentist.is_active).length,
        activeManagers: memberships.data.filter((membership) => membership.is_active && membership.role === 'BRANCH_ADMIN').length,
      })
      setAlerts({
        missingManagers: branches.data.filter((branch) => branch.is_active && !managedBranchIds.has(branch.id_branch)).map((branch) => branch.name),
        failedInvitations: invitations.data.filter((invitation) => invitation.status === 'PENDING' && invitation.email_delivery_status === 'FAILED').length,
        expiredInvitations: invitations.data.filter((invitation) => invitation.status === 'EXPIRED').length,
      })
    }).catch(() => {
      if (!controller.signal.aborted) {
        setNetwork({ activeBranches: 0, activeDentists: 0, activeManagers: 0 })
        setAlerts({ missingManagers: [], failedInvitations: 0, expiredInvitations: 0 })
      }
    })
    return () => controller.abort()
  }, [scope.organizationId, reloadKey])

  function applyRange() {
    const rangeError = validateOrganizationReportRange(range.from, range.to)
    if (rangeError) {
      setError(rangeError)
      return
    }
    setAppliedRange(range)
  }

  function applyQuickRange(days: number) {
    const nextRange = organizationReportRange(days)
    setRange(nextRange)
    setAppliedRange(nextRange)
  }

  return (
    <OrganizationPageLayout
      organizationId={scope.organizationId}
      heroKicker="Điều hành toàn hệ thống"
      heroTitle={organizationName}
      heroDescription="Theo dõi doanh thu, lịch hẹn và hiệu suất ghế trên toàn bộ chi nhánh."
      heroAside={
        <div className="organization-date-range">
          <div className="organization-quick-ranges" aria-label="Chọn kỳ báo cáo nhanh">
            {[7, 30, 90].map((days) => (
              <button
                className={range.from === organizationReportRange(days).from && range.to === organizationReportRange(days).to ? 'is-active' : ''}
                key={days}
                type="button"
                onClick={() => applyQuickRange(days)}
              >
                {days} ngày
              </button>
            ))}
          </div>
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
            onClick={() => {
              if (range.from === appliedRange.from && range.to === appliedRange.to) setReloadKey((current) => current + 1)
              else applyRange()
            }}
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
          <section className="organization-network-summary" aria-label="Quy mô vận hành">
            <article><span>Chi nhánh hoạt động</span><strong>{network.activeBranches}</strong><small>Đang phục vụ trong chuỗi</small></article>
            <article><span>Nha sĩ hoạt động</span><strong>{network.activeDentists}</strong><small>Đã được phân công chuyên môn</small></article>
            <article><span>Quản lý chi nhánh</span><strong>{network.activeManagers}</strong><small>Đang có quyền vận hành</small></article>
          </section>
          {(alerts.missingManagers.length > 0 || alerts.failedInvitations > 0 || alerts.expiredInvitations > 0) && <section className="organization-alerts" aria-label="Cảnh báo vận hành"><header><div><span className="branch-report-eyebrow">CẦN XỬ LÝ</span><h2>Cảnh báo vận hành</h2></div><Link className="organization-inline-link" to="/quan-ly-to-chuc/nhan-su">Mở nhân sự</Link></header><div>{alerts.missingManagers.length > 0 && <article><strong>{alerts.missingManagers.length} chi nhánh chưa có quản lý</strong><p>{alerts.missingManagers.join(', ')}</p></article>}{alerts.failedInvitations > 0 && <article><strong>{alerts.failedInvitations} lời mời gửi email lỗi</strong><p>Vào Nhân sự để gửi lại lời mời cho đúng người nhận.</p></article>}{alerts.expiredInvitations > 0 && <article><strong>{alerts.expiredInvitations} lời mời đã hết hạn</strong><p>Gửi lại hoặc ẩn lời mời không còn sử dụng.</p></article>}</div></section>}
          <OrganizationReportSummary {...data} />
          <OrganizationBranchComparisonTable {...data} />
          <div className="organization-report-grid">
            <OrganizationServiceRevenueTable revenue={data.revenue} />
            <OrganizationDailyRevenueTable revenue={data.revenue} />
          </div>
        </>
      )}
    </OrganizationPageLayout>
  )
}
