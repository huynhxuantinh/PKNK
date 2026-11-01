import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { organizationReport, type RevenueReport } from '../api/organization'
import { DataTable, EmptyState, StatusBadge } from '../components/admin/ui'
import { OrganizationPageLayout } from '../components/organization-management/OrganizationPageLayout'
import { useOrganizationScope } from '../components/organization-management/useOrganizationScope'
import { formatVnd } from '../components/branch-management/branchReportPresentation'
import { defaultOrganizationReportRange, organizationReportRange, validateOrganizationReportRange } from '../features/organization/organizationReports'
import { exportOrganizationFinanceCsv, printOrganizationFinanceReport } from '../features/organization/organizationReportExport'

export function OrganizationFinancePage() {
  const scope = useOrganizationScope()
  const [range, setRange] = useState(defaultOrganizationReportRange)
  const [appliedRange, setAppliedRange] = useState(defaultOrganizationReportRange)
  const [report, setReport] = useState<RevenueReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const organizationName = scope.options.find((option) => option.id === scope.organizationId)?.name || 'Quản trị tổ chức'

  useEffect(() => {
    if (!scope.organizationId) return
    const validation = validateOrganizationReportRange(appliedRange.from, appliedRange.to)
    if (validation) { setError(validation); return }
    const controller = new AbortController()
    setLoading(true); setError('')
    organizationReport(scope.organizationId, 'revenue', appliedRange.from, appliedRange.to, controller.signal)
      .then((response) => { if (!controller.signal.aborted) setReport(response.data as RevenueReport) })
      .catch((caught) => { if (!controller.signal.aborted) { setReport(null); setError(caught instanceof Error ? caught.message : 'Không thể tải dữ liệu tài chính.') } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [appliedRange.from, appliedRange.to, scope.organizationId])

  function applyRange() {
    const validation = validateOrganizationReportRange(range.from, range.to)
    if (validation) { setError(validation); return }
    setAppliedRange(range)
  }

  const canExport = Boolean(report && !loading)
  function exportCsv() { if (report) exportOrganizationFinanceCsv({ organizationName, from: appliedRange.from, to: appliedRange.to, report }) }
  function printReport() { if (report) printOrganizationFinanceReport({ organizationName, from: appliedRange.from, to: appliedRange.to, report }) }

  return <OrganizationPageLayout organizationId={scope.organizationId} heroKicker="Tài chính toàn chuỗi" heroTitle={organizationName} heroDescription="Theo dõi doanh thu đã thanh toán theo chi nhánh. Phát hành, hủy và ghi nhận thanh toán được xử lý tại từng chi nhánh." heroAside={<div className="organization-date-range"><div className="organization-quick-ranges">{[7, 30, 90].map((days) => <button key={days} type="button" className={range.from === organizationReportRange(days).from ? 'is-active' : undefined} onClick={() => { const next = organizationReportRange(days); setRange(next); setAppliedRange(next) }}>{days} ngày</button>)}</div><label>Từ ngày<input type="date" value={range.from} max={range.to} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} /></label><label>Đến ngày<input type="date" value={range.to} min={range.from} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} /></label><button type="button" disabled={loading} onClick={applyRange}>{loading ? 'Đang tải...' : 'Xem báo cáo'}</button></div>}>
    {error && <div className="dentist-error" role="alert">{error}</div>}
    <section className="branch-management-schedule organization-report-section" aria-labelledby="organization-finance-title"><header><div><span className="branch-report-eyebrow">DOANH THU ĐÃ THANH TOÁN</span><h2 id="organization-finance-title">Tổng quan tài chính</h2></div><div className="organization-report-actions"><button type="button" disabled={!canExport} onClick={exportCsv}>Xuất CSV</button><button type="button" disabled={!canExport} onClick={printReport}>In / PDF</button><small>{appliedRange.from} – {appliedRange.to}</small></div></header>{loading ? <p role="status">Đang tải doanh thu...</p> : report ? <div className="organization-report-grid"><article className="admin-card organization-finance-kpi"><span>Doanh thu toàn chuỗi</span><strong>{formatVnd(report.total_revenue)}</strong><small>Chỉ tính hóa đơn đã thanh toán</small></article><article className="admin-card organization-finance-kpi"><span>Hóa đơn đã thanh toán</span><strong>{report.paid_invoice_count}</strong><small>Trong kỳ báo cáo đã chọn</small></article></div> : <EmptyState title="Chưa có dữ liệu doanh thu" description="Chọn khoảng thời gian để xem báo cáo." />}</section>
    <section className="branch-management-schedule organization-report-section" aria-label="Doanh thu theo chi nhánh"><header><div><span className="branch-report-eyebrow">SO SÁNH CHI NHÁNH</span><h2>Doanh thu theo cơ sở</h2></div><small>Đi tới chi nhánh để xem hóa đơn và thanh toán</small></header>{!loading && report && <DataTable rows={report.by_branch} rowKey={(row) => row.branch_id} empty={<EmptyState title="Không có doanh thu" description="Chưa có hóa đơn đã thanh toán trong kỳ này." />} columns={[{ key: 'branch', header: 'Chi nhánh', cell: (row) => row.branch_name }, { key: 'revenue', header: 'Doanh thu', cell: (row) => formatVnd(row.revenue) }, { key: 'invoices', header: 'Hóa đơn đã thanh toán', cell: (row) => <StatusBadge tone="success">{row.paid_invoice_count} hóa đơn</StatusBadge> }, { key: 'action', header: '', className: 'organization-branch-actions-cell', cell: (row) => <Link className="organization-inline-link" to={`/quan-ly-chi-nhanh/hoa-don?chi-nhanh=${row.branch_id}`}>Xem hóa đơn</Link> }]} />}</section>
    <p className="organization-hint">Danh sách hóa đơn toàn chuỗi chưa tải ở trình duyệt để tránh thiếu hoặc sai phân trang. Mục này cần API tổng hợp có phân trang phía máy chủ trước khi mở rộng.</p>
  </OrganizationPageLayout>
}
