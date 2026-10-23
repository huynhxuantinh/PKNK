import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { branchReport } from '../api/management'
import { useAuth } from '../auth/AuthContext'

const iso = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const asText = (value: unknown) => typeof value === 'number' || typeof value === 'string' ? String(value) : '—'

export function BranchReportsPage() {
  const { isAuthenticated, user } = useAuth(); const [params] = useSearchParams(); const branchId = Number(params.get('chi-nhanh')) || 0
  const [from, setFrom] = useState(() => iso(new Date(new Date().getTime() - 29 * 86400000))); const [to, setTo] = useState(() => iso(new Date())); const [data, setData] = useState<Record<string, Record<string, unknown>>>({}); const [error, setError] = useState('')
  const manager = user?.memberships?.some((m) => m.is_active && ['BRANCH_ADMIN', 'ORGANIZATION_ADMIN'].includes(m.role))
  async function load() { try { const [revenue, appointments, chairs] = await Promise.all([branchReport(branchId, 'revenue', from, to), branchReport(branchId, 'appointments', from, to), branchReport(branchId, 'chair-utilization', from, to)]); setData({ revenue: revenue.data, appointments: appointments.data, chairs: chairs.data }) } catch (e) { setError(e instanceof Error ? e.message : 'Không thể tải báo cáo.') } }
  useEffect(() => { if (branchId) void load() }, [branchId])
  if (!isAuthenticated || !manager || !branchId) return <Navigate to="/quan-ly-chi-nhanh" replace />
  return <main className="branch-management-page"><div className="branch-management-main"><Link to={`/quan-ly-chi-nhanh?chi-nhanh=${branchId}`}>← Quay lại quản lý chi nhánh</Link><h1>Báo cáo chi nhánh</h1><div className="branch-management-filters"><label>Từ ngày<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>Đến ngày<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label><button onClick={load}>Xem báo cáo</button></div>{error && <div className="dentist-error">{error}</div>}<section className="branch-management-summary"><article><span>Doanh thu</span><strong>{asText(data.revenue?.total_revenue)} ₫</strong><small>{asText(data.revenue?.paid_invoice_count)} hóa đơn đã thanh toán</small></article><article><span>Tổng lịch hẹn</span><strong>{asText(data.appointments?.total_appointments)}</strong><small>Hoàn tất: {asText(data.appointments?.completed_count)}</small></article><article><span>Tỷ lệ hủy</span><strong>{asText(data.appointments?.cancellation_rate_percent)}%</strong><small>Không đến: {asText(data.appointments?.no_show_rate_percent)}%</small></article><article><span>Khai thác ghế</span><strong>{asText(data.chairs?.utilization_rate_percent)}%</strong><small>{asText(data.chairs?.occupied_minutes)} phút sử dụng</small></article></section></div></main>
}
