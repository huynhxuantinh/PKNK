import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'

import { cancelManagedAppointment, checkInManagedAppointment, confirmManagedAppointment, listBranchAppointments, markManagedAppointmentNoShow, type ManagementAppointment, type ManagementAppointmentStatus } from '../api/management'
import { getBranchDetail } from '../api/booking'
import { AuthBar } from '../auth/AuthBar'
import { useAuth } from '../auth/AuthContext'
import { Seo } from '../seo/Seo'
import type { BranchDetail } from '../types/api'

const statusText: Record<ManagementAppointmentStatus, string> = { PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', CHECKED_IN: 'Đã check-in', IN_PROGRESS: 'Đang khám', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy', NO_SHOW: 'Không đến' }

function toDateInput(date: Date) { const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 10) }
function timeOf(value: string) { return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }

export function BranchManagementPage() {
  const { isAuthenticated, user } = useAuth()
  const [params, setParams] = useSearchParams()
  const branchIds = useMemo(() => Array.from(new Set(user?.memberships?.filter((item) => item.role === 'BRANCH_ADMIN' && item.branch_id).map((item) => item.branch_id as number) || [])), [user])
  const selectedBranchId = Number(params.get('chi-nhanh')) || branchIds[0] || null
  const [date, setDate] = useState(() => toDateInput(new Date()))
  const [status, setStatus] = useState<ManagementAppointmentStatus | ''>('')
  const [branch, setBranch] = useState<BranchDetail | null>(null)
  const [appointments, setAppointments] = useState<ManagementAppointment[] | null>(null)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState('')

  useEffect(() => {
    if (!selectedBranchId || !branchIds.includes(selectedBranchId)) return
    let active = true; setBranch(null)
    getBranchDetail(selectedBranchId).then((response) => { if (active) setBranch(response.data) }).catch((reason) => active && setError(reason instanceof Error ? reason.message : 'Không thể tải thông tin chi nhánh.'))
    return () => { active = false }
  }, [branchIds, selectedBranchId])

  useEffect(() => {
    if (!selectedBranchId || !branchIds.includes(selectedBranchId)) return
    let active = true; setAppointments(null); setError('')
    listBranchAppointments(selectedBranchId, new Date(`${date}T12:00:00`), status || undefined).then((response) => active && setAppointments(response.data)).catch((reason) => active && setError(reason instanceof Error ? reason.message : 'Không thể tải lịch hẹn.'))
    return () => { active = false }
  }, [branchIds, date, selectedBranchId, status])

  const summary = useMemo(() => ({ total: appointments?.length || 0, pending: appointments?.filter((item) => item.status === 'PENDING').length || 0, checkedIn: appointments?.filter((item) => item.status === 'CHECKED_IN').length || 0, inProgress: appointments?.filter((item) => item.status === 'IN_PROGRESS').length || 0 }), [appointments])
  async function runAction(appointment: ManagementAppointment, action: 'confirm' | 'check-in' | 'no-show' | 'cancel') {
    if (action === 'cancel' && !window.confirm(`Hủy lịch của ${appointment.patient_name}?`)) return
    setProcessing(appointment.public_code); setError('')
    try {
      const response = action === 'confirm' ? await confirmManagedAppointment(appointment.public_code) : action === 'check-in' ? await checkInManagedAppointment(appointment.public_code) : action === 'no-show' ? await markManagedAppointmentNoShow(appointment.public_code) : await cancelManagedAppointment(appointment.public_code, 'Chi nhánh hủy lịch.')
      setAppointments((current) => current?.map((item) => item.public_code === appointment.public_code ? response.data : item) || null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể cập nhật lịch hẹn.') } finally { setProcessing('') }
  }

  if (!isAuthenticated) return <Navigate to="/dang-nhap?returnTo=%2Fquan-ly-chi-nhanh" replace />
  if (!user?.memberships?.some((item) => item.role === 'BRANCH_ADMIN') || !selectedBranchId || !branchIds.includes(selectedBranchId)) return <Navigate to="/" replace />
  return <div className="branch-management-page">
    <Seo title="Quản lý chi nhánh | DentaVie" description="Khu vực vận hành chi nhánh DentaVie." path="/quan-ly-chi-nhanh" noIndex />
    <header className="dentist-header"><Link className="brand" to="/" aria-label="Trang chủ DentaVie"><img src="/branding/dentavie-logo-horizontal-color.png" alt="DentaVie" /></Link><div className="dentist-header-context"><span>Khu vực vận hành</span><strong>Quản lý chi nhánh</strong></div><AuthBar /></header>
    <main className="branch-management-main">
      <section className="branch-management-hero"><div><p className="eyebrow">Vận hành hằng ngày</p><h1>{branch?.name || 'Quản lý chi nhánh'}</h1><p>{branch?.full_address || 'Đang tải thông tin chi nhánh...'}</p></div>{branchIds.length > 1 && <label>Chi nhánh làm việc<select value={selectedBranchId} onChange={(event) => setParams({ 'chi-nhanh': event.target.value })}>{branchIds.map((id) => <option key={id} value={id}>{user.memberships?.find((item) => item.branch_id === id && item.role === 'BRANCH_ADMIN')?.branch_name || `Chi nhánh #${id}`}</option>)}</select></label>}</section>
      {error && <div className="dentist-error" role="alert">{error}</div>}
      <section className="branch-management-summary"><article><span>Lịch trong ngày</span><strong>{summary.total}</strong><small>{date}</small></article><article><span>Chờ xác nhận</span><strong>{summary.pending}</strong><small>Cần xử lý</small></article><article><span>Đã check-in</span><strong>{summary.checkedIn}</strong><small>Sẵn sàng khám</small></article><article><span>Đang khám</span><strong>{summary.inProgress}</strong><small>Đang phục vụ</small></article></section>
      <section className="branch-management-schedule"><header><div><p className="eyebrow">Lịch hẹn chi nhánh</p><h2>Điều phối lịch khám</h2></div><Link to={`/chi-nhanh/${selectedBranchId}`}>Xem trang chi nhánh →</Link></header><div className="branch-management-filters"><label>Ngày<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Trạng thái<select value={status} onChange={(event) => setStatus(event.target.value as ManagementAppointmentStatus | '')}><option value="">Tất cả trạng thái</option>{Object.entries(statusText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>{!appointments && !error ? <div className="dentist-empty">Đang tải lịch hẹn...</div> : appointments?.length === 0 ? <div className="dentist-empty"><strong>Không có lịch hẹn trong ngày này.</strong></div> : <div className="branch-management-list">{appointments?.map((appointment) => <article key={appointment.public_code} className="branch-management-appointment"><time><strong>{timeOf(appointment.starts_at)}</strong><span>{timeOf(appointment.ends_at)}</span></time><div><span className={`dentist-status is-${appointment.status.toLowerCase()}`}>{statusText[appointment.status]}</span><h3>{appointment.patient_name}</h3><p>{appointment.service_name_snapshot} · {appointment.dentist_name}</p><small>{appointment.patient_phone || 'Chưa có số điện thoại'}{appointment.chair_name ? ` · ${appointment.chair_name}` : ''}</small></div><div className="branch-management-actions">{appointment.status === 'PENDING' && <button type="button" onClick={() => runAction(appointment, 'confirm')} disabled={processing === appointment.public_code}>Xác nhận</button>}{appointment.status === 'CONFIRMED' && <button type="button" onClick={() => runAction(appointment, 'check-in')} disabled={processing === appointment.public_code}>Check-in</button>}{['PENDING', 'CONFIRMED'].includes(appointment.status) && <button type="button" className="button-secondary" onClick={() => runAction(appointment, 'cancel')} disabled={processing === appointment.public_code}>Hủy lịch</button>}{['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(appointment.status) && <button type="button" className="button-quiet" onClick={() => runAction(appointment, 'no-show')} disabled={processing === appointment.public_code}>Không đến</button>}</div></article>)}</div>}</section>
    </main>
  </div>
}
