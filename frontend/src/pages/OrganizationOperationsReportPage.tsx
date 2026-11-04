import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  organizationReport,
  type AppointmentReport,
  type ChairUtilizationReport,
} from '../api/organization'
import { formatPercent } from '../components/branch-management/branchReportPresentation'
import { DataTable, EmptyState, StatusBadge } from '../components/admin/ui'
import { OrganizationPageLayout } from '../components/organization-management/OrganizationPageLayout'
import { useOrganizationScope } from '../components/organization-management/useOrganizationScope'
import {
  defaultOrganizationReportRange,
  formatMinutes,
  organizationReportRange,
  validateOrganizationReportRange,
} from '../features/organization/organizationReports'
import { exportOrganizationOperationsCsv, printOrganizationOperationsReport } from '../features/organization/organizationReportExport'

export function OrganizationOperationsReportPage() {
  const scope = useOrganizationScope()
  const [range, setRange] = useState(defaultOrganizationReportRange)
  const [appliedRange, setAppliedRange] = useState(defaultOrganizationReportRange)
  const [appointments, setAppointments] = useState<AppointmentReport | null>(null)
  const [chairs, setChairs] = useState<ChairUtilizationReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const organizationName = scope.options.find((option) => option.id === scope.organizationId)?.name || 'Quản trị tổ chức'

  useEffect(() => {
    if (!scope.organizationId) return
    const validation = validateOrganizationReportRange(appliedRange.from, appliedRange.to)
    if (validation) { setError(validation); return }
    const controller = new AbortController()
    setLoading(true)
    setError('')
    Promise.all([
      organizationReport(scope.organizationId, 'appointments', appliedRange.from, appliedRange.to, controller.signal),
      organizationReport(scope.organizationId, 'chair-utilization', appliedRange.from, appliedRange.to, controller.signal),
    ])
      .then(([appointmentResponse, chairResponse]) => {
        if (controller.signal.aborted) return
        setAppointments(appointmentResponse.data as AppointmentReport)
        setChairs(chairResponse.data as ChairUtilizationReport)
      })
      .catch((caught) => {
        if (controller.signal.aborted) return
        setAppointments(null)
        setChairs(null)
        setError(caught instanceof Error ? caught.message : 'Không thể tải báo cáo vận hành.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [appliedRange.from, appliedRange.to, scope.organizationId])

  function applyRange() {
    const validation = validateOrganizationReportRange(range.from, range.to)
    if (validation) { setError(validation); return }
    setAppliedRange(range)
  }

  const canExport = Boolean(appointments && chairs && !loading)
  function exportCsv() {
    if (!appointments || !chairs) return
    exportOrganizationOperationsCsv({ organizationName, from: appliedRange.from, to: appliedRange.to, appointments, chairs })
  }
  function printReport() {
    if (!appointments || !chairs) return
    printOrganizationOperationsReport({ organizationName, from: appliedRange.from, to: appliedRange.to, appointments, chairs })
  }

  return <OrganizationPageLayout organizationId={scope.organizationId} heroKicker="Báo cáo vận hành" heroTitle={organizationName} heroDescription="Theo dõi chất lượng lịch hẹn và mức khai thác ghế trên toàn bộ chi nhánh." heroAside={<div className="organization-date-range"><div className="organization-quick-ranges">{[7, 30, 90].map((days) => <button key={days} type="button" className={range.from === organizationReportRange(days).from ? 'is-active' : undefined} onClick={() => { const next = organizationReportRange(days); setRange(next); setAppliedRange(next) }}>{days} ngày</button>)}</div><label>Từ ngày<input type="date" value={range.from} max={range.to} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} /></label><label>Đến ngày<input type="date" value={range.to} min={range.from} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} /></label><button type="button" disabled={loading} onClick={applyRange}>{loading ? 'Đang tải...' : 'Xem báo cáo'}</button></div>}>
    {error && <div className="app-error" role="alert">{error}</div>}
    <section className="branch-management-schedule organization-report-section" aria-labelledby="operations-summary-title"><header><div><span className="branch-report-eyebrow">CHẤT LƯỢNG PHỤC VỤ</span><h2 id="operations-summary-title">Tổng quan vận hành</h2></div><div className="organization-report-actions"><button type="button" disabled={!canExport} onClick={exportCsv}>Xuất CSV</button><button type="button" disabled={!canExport} onClick={printReport}>In / PDF</button><small>{appliedRange.from} – {appliedRange.to}</small></div></header>{loading ? <p role="status">Đang tải báo cáo vận hành...</p> : appointments && chairs ? <><p className="organization-table-note">Lượt sử dụng là lịch sử theo khoảng ngày; ghế đang hoạt động phản ánh hiện tại. Tỷ lệ khai thác là ước tính vì chưa lưu thời điểm ghế bắt đầu hoặc ngừng hoạt động.</p><div className="organization-report-grid"><article className="admin-card organization-finance-kpi"><span>Tổng lịch hẹn</span><strong>{appointments.total_appointments}</strong><small>{appointments.completed_count} lịch đã hoàn tất</small></article><article className="admin-card organization-finance-kpi"><span>Tỷ lệ hủy / không đến</span><strong>{formatPercent(appointments.cancellation_rate_percent)}</strong><small>{formatPercent(appointments.no_show_rate_percent)} không đến</small></article><article className="admin-card organization-finance-kpi"><span>Khai thác ghế (ước tính)</span><strong>{formatPercent(chairs.utilization_rate_percent)}</strong><small>{chairs.current_active_chair_count} ghế đang hoạt động · {formatMinutes(chairs.occupied_minutes)} đã sử dụng</small></article></div></> : <EmptyState title="Chưa có dữ liệu vận hành" description="Chọn một khoảng thời gian để xem báo cáo." />}</section>
    <section className="branch-management-schedule organization-report-section" aria-label="So sánh vận hành theo chi nhánh"><header><div><span className="branch-report-eyebrow">SO SÁNH CHI NHÁNH</span><h2>Lịch hẹn và hiệu suất ghế</h2></div><small>Đi tới từng chi nhánh để điều phối lịch chi tiết</small></header>{!loading && appointments && chairs && <DataTable rows={appointments.by_branch} rowKey={(row) => row.branch_id} empty={<EmptyState title="Chưa có lịch hẹn" description="Không có dữ liệu trong khoảng thời gian này." />} columns={[{ key: 'branch', header: 'Chi nhánh', cell: (row) => row.branch_name }, { key: 'appointments', header: 'Lịch hẹn', cell: (row) => <><b>{row.total_appointments}</b><small className="organization-table-note">{row.completed_count} hoàn tất</small></> }, { key: 'cancelled', header: 'Hủy / không đến', cell: (row) => <><StatusBadge tone={Number(row.cancellation_rate_percent) > 10 ? 'warning' : 'success'}>{formatPercent(row.cancellation_rate_percent)} hủy</StatusBadge><small className="organization-table-note">{formatPercent(row.no_show_rate_percent)} không đến</small></> }, { key: 'chairs', header: 'Khai thác ghế', cell: (row) => { const chair = chairs.by_branch.find((item) => item.branch_id === row.branch_id); return chair ? <><StatusBadge tone={Number(chair.utilization_rate_percent) >= 70 ? 'success' : 'info'}>{formatPercent(chair.utilization_rate_percent)}</StatusBadge><small className="organization-table-note">{chair.current_active_chair_count} ghế · {formatMinutes(chair.occupied_minutes)}</small></> : '—' } }, { key: 'action', header: '', cell: (row) => <Link className="organization-inline-link" to={`/quan-ly-chi-nhanh/bao-cao?chi-nhanh=${row.branch_id}`}>Mở chi nhánh</Link> }]} />}</section>
  </OrganizationPageLayout>
}
