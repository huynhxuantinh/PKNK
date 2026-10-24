import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'

import { branchReport } from '../api/management'
import { useAuth } from '../auth/AuthContext'
import { canAccessArea } from '../auth/roles'
import { ManagementPageHeader } from '../components/branch-management/ManagementPageHeader'
import { ManagementSectionNav } from '../components/branch-management/ManagementSectionNav'

const iso = (date: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date)
const asText = (value: unknown) => typeof value === 'number' || typeof value === 'string' ? String(value) : '—'

export function BranchReportsPage() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const branchId = Number(params.get('chi-nhanh')) || 0
  const [from, setFrom] = useState(() => iso(new Date(Date.now() - 29 * 86400000)))
  const [to, setTo] = useState(() => iso(new Date()))
  const [data, setData] = useState<Record<string, Record<string, unknown>>>({})
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [revenue, appointments, chairs] = await Promise.all([
        branchReport(branchId, 'revenue', from, to),
        branchReport(branchId, 'appointments', from, to),
        branchReport(branchId, 'chair-utilization', from, to),
      ])
      setData({ revenue: revenue.data, appointments: appointments.data, chairs: chairs.data })
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể tải báo cáo.')
    }
  }, [branchId, from, to])

  useEffect(() => { if (branchId) void load() }, [branchId, load])
  if (!canAccessArea(user, 'MANAGEMENT') || !branchId) return <Navigate to="/quan-ly-chi-nhanh" replace />

  return <div className="branch-management-page">
    <ManagementPageHeader title="Báo cáo chi nhánh" path="/quan-ly-chi-nhanh/bao-cao" />
    <main className="branch-management-main">
      <Link className="staff-schedule-back" to={`/quan-ly-chi-nhanh?chi-nhanh=${branchId}`}>← Quay lại quản lý chi nhánh</Link>
      <h1>Báo cáo chi nhánh</h1>
      <ManagementSectionNav branchId={branchId} active="reports" />
      <div className="branch-management-filters"><label>Từ ngày<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>Đến ngày<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button onClick={() => void load()}>Xem báo cáo</button></div>
      {error && <div className="dentist-error" role="alert">{error}</div>}
      <section className="branch-management-summary"><article><span>Doanh thu</span><strong>{asText(data.revenue?.total_revenue)} ₫</strong><small>{asText(data.revenue?.paid_invoice_count)} hóa đơn đã thanh toán</small></article><article><span>Tổng lịch hẹn</span><strong>{asText(data.appointments?.total_appointments)}</strong><small>Hoàn tất: {asText(data.appointments?.completed_count)}</small></article><article><span>Tỷ lệ hủy</span><strong>{asText(data.appointments?.cancellation_rate_percent)}%</strong><small>Không đến: {asText(data.appointments?.no_show_rate_percent)}%</small></article><article><span>Khai thác ghế</span><strong>{asText(data.chairs?.utilization_rate_percent)}%</strong><small>{asText(data.chairs?.occupied_minutes)} phút sử dụng</small></article></section>
    </main>
  </div>
}
