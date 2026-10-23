import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { cancelManagedAppointment, checkInManagedAppointment, confirmManagedAppointment, listBranchAppointments, listManagedOrganizationBranches, markManagedAppointmentNoShow, type ManagedBranch, type ManagementAppointment, type ManagementAppointmentStatus } from '../api/management'
import { getBranchDetail } from '../api/booking'
import { AuthBar } from '../auth/AuthBar'
import { useAuth } from '../auth/AuthContext'
import { Seo } from '../seo/Seo'
import type { BranchDetail } from '../types/api'

const statusText: Record<ManagementAppointmentStatus, string> = { PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', CHECKED_IN: 'Đã check-in', IN_PROGRESS: 'Đang khám', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy', NO_SHOW: 'Không đến' }
const hcmDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
const timeOf = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }).format(new Date(value))

export function BranchManagementPage() {
  const { isAuthenticated, user } = useAuth()
  const [params, setParams] = useSearchParams()
  const directBranches = useMemo<ManagedBranch[]>(() => (user?.memberships || []).filter((item) => item.is_active && item.role === 'BRANCH_ADMIN' && item.branch_id).map((item) => ({ id_branch: item.branch_id as number, name: item.branch_name || `Chi nhánh #${item.branch_id}`, is_active: true })), [user])
  const organizationIds = useMemo(() => Array.from(new Set((user?.memberships || []).filter((item) => item.is_active && item.role === 'ORGANIZATION_ADMIN').map((item) => item.organization_id))), [user])
  const [managedBranches, setManagedBranches] = useState<ManagedBranch[]>(directBranches)
  const [branchLookupComplete, setBranchLookupComplete] = useState(() => organizationIds.length === 0)
  const branchIds = useMemo(() => managedBranches.filter((item) => item.is_active).map((item) => item.id_branch), [managedBranches])
  const requestedBranchId = Number(params.get('chi-nhanh')) || null
  const selectedBranchId = requestedBranchId && branchIds.includes(requestedBranchId) ? requestedBranchId : branchIds[0] || null
  const [date, setDate] = useState(() => hcmDate(new Date()))
  const [status, setStatus] = useState<ManagementAppointmentStatus | ''>('')
  const [branch, setBranch] = useState<BranchDetail | null>(null)
  const [appointments, setAppointments] = useState<ManagementAppointment[] | null>(null)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState('')
  const [cancelling, setCancelling] = useState<ManagementAppointment | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const isManager = user?.memberships?.some((item) => item.is_active && ['BRANCH_ADMIN', 'ORGANIZATION_ADMIN'].includes(item.role))

  useEffect(() => {
    let active = true
    setBranchLookupComplete(organizationIds.length === 0)
    Promise.all(organizationIds.map((id) => listManagedOrganizationBranches(id))).then((responses) => {
      if (!active) return
      const merged = [...directBranches, ...responses.flatMap((response) => response.data)]
      setManagedBranches(Array.from(new Map(merged.map((item) => [item.id_branch, item])).values()))
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : 'Không thể tải danh sách chi nhánh.')).finally(() => { if (active) setBranchLookupComplete(true) })
    return () => { active = false }
  }, [directBranches, organizationIds])
  useEffect(() => { if (selectedBranchId && requestedBranchId !== selectedBranchId) setParams({ 'chi-nhanh': String(selectedBranchId) }, { replace: true }) }, [requestedBranchId, selectedBranchId, setParams])
  useEffect(() => {
    if (!selectedBranchId) return
    let active = true; setBranch(null)
    getBranchDetail(selectedBranchId).then((response) => { if (active) setBranch(response.data) }).catch((reason) => active && setError(reason instanceof Error ? reason.message : 'Không thể tải thông tin chi nhánh.'))
    return () => { active = false }
  }, [selectedBranchId])
  useEffect(() => {
    if (!selectedBranchId) return
    let active = true; setAppointments(null); setError('')
    listBranchAppointments(selectedBranchId, date, status || undefined).then((response) => active && setAppointments(response.data)).catch((reason) => active && setError(reason instanceof Error ? reason.message : 'Không thể tải lịch hẹn.'))
    return () => { active = false }
  }, [date, selectedBranchId, status])

  const summary = useMemo(() => ({ total: appointments?.length || 0, pending: appointments?.filter((item) => item.status === 'PENDING').length || 0, checkedIn: appointments?.filter((item) => item.status === 'CHECKED_IN').length || 0, inProgress: appointments?.filter((item) => item.status === 'IN_PROGRESS').length || 0 }), [appointments])
  const updateAppointment = (next: ManagementAppointment) => setAppointments((current) => current?.map((item) => item.public_code === next.public_code ? next : item) || null)
  async function runAction(appointment: ManagementAppointment, action: 'confirm' | 'check-in' | 'no-show' | 'cancel') {
    if (action === 'cancel') { setCancelling(appointment); setCancelReason(''); return }
    setProcessing(appointment.public_code); setError('')
    try { const response = action === 'confirm' ? await confirmManagedAppointment(appointment.public_code) : action === 'check-in' ? await checkInManagedAppointment(appointment.public_code) : await markManagedAppointmentNoShow(appointment.public_code); updateAppointment(response.data) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể cập nhật lịch hẹn.') } finally { setProcessing('') }
  }
  async function submitCancellation(event: FormEvent) {
    event.preventDefault()
    if (!cancelling || !cancelReason.trim()) return
    setProcessing(cancelling.public_code); setError('')
    try { const response = await cancelManagedAppointment(cancelling.public_code, cancelReason.trim()); updateAppointment(response.data); setCancelling(null) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể hủy lịch hẹn.') } finally { setProcessing('') }
  }
  if (!isAuthenticated) return <Navigate to="/dang-nhap?returnTo=%2Fquan-ly-chi-nhanh" replace />
  if (!isManager || (branchLookupComplete && !selectedBranchId)) return <Navigate to="/" replace />
  return <div className="branch-management-page">
    <Seo title="Quản lý chi nhánh | DentaVie" description="Khu vực vận hành chi nhánh DentaVie." path="/quan-ly-chi-nhanh" noIndex />
    <header className="dentist-header"><Link className="brand" to="/" aria-label="Trang chủ DentaVie"><img src="/branding/dentavie-logo-horizontal-color.png" alt="DentaVie" /></Link><div className="dentist-header-context"><span>Khu vực vận hành</span><strong>Quản lý chi nhánh</strong></div><AuthBar /></header>
    <main className="branch-management-main">
      <section className="branch-management-hero"><div><p className="eyebrow">Vận hành hằng ngày</p><h1>{branch?.name || 'Quản lý chi nhánh'}</h1><p>{branch?.full_address || 'Đang tải thông tin chi nhánh...'}</p></div>{branchIds.length > 1 && <label>Chi nhánh làm việc<select value={selectedBranchId || ''} onChange={(event) => setParams({ 'chi-nhanh': event.target.value })}>{managedBranches.filter((item) => item.is_active).map((item) => <option key={item.id_branch} value={item.id_branch}>{item.name}</option>)}</select></label>}</section>
      {error && <div className="dentist-error" role="alert">{error}</div>}
      <section className="branch-management-summary"><article><span>Lịch trong ngày</span><strong>{summary.total}</strong><small>{date}</small></article><article><span>Chờ xác nhận</span><strong>{summary.pending}</strong><small>Cần xử lý</small></article><article><span>Đã check-in</span><strong>{summary.checkedIn}</strong><small>Sẵn sàng khám</small></article><article><span>Đang khám</span><strong>{summary.inProgress}</strong><small>Đang phục vụ</small></article></section>
      <section className="branch-management-schedule"><header><div><p className="eyebrow">Lịch hẹn chi nhánh</p><h2>Điều phối lịch khám</h2></div><Link to={`/chi-nhanh/${selectedBranchId}`}>Xem trang chi nhánh →</Link></header><div className="branch-management-filters"><label>Ngày<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Trạng thái<select value={status} onChange={(event) => setStatus(event.target.value as ManagementAppointmentStatus | '')}><option value="">Tất cả trạng thái</option>{Object.entries(statusText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>{!appointments && !error ? <div className="dentist-empty">Đang tải lịch hẹn...</div> : appointments?.length === 0 ? <div className="dentist-empty"><strong>Không có lịch hẹn trong ngày này.</strong></div> : <div className="branch-management-list">{appointments?.map((appointment) => <article key={appointment.public_code} className="branch-management-appointment"><time><strong>{timeOf(appointment.starts_at)}</strong><span>{timeOf(appointment.ends_at)}</span></time><div><span className={`dentist-status is-${appointment.status.toLowerCase()}`}>{statusText[appointment.status]}</span><h3>{appointment.patient_name}</h3><p>{appointment.service_name_snapshot} · {appointment.dentist_name}</p><small>{appointment.patient_phone || 'Chưa có số điện thoại'}{appointment.chair_name ? ` · ${appointment.chair_name}` : ''}</small></div><div className="branch-management-actions">{appointment.status === 'PENDING' && <button type="button" onClick={() => runAction(appointment, 'confirm')} disabled={processing === appointment.public_code}>Xác nhận</button>}{appointment.status === 'CONFIRMED' && <button type="button" onClick={() => runAction(appointment, 'check-in')} disabled={processing === appointment.public_code}>Check-in</button>}{['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(appointment.status) && <button type="button" className="button-secondary" onClick={() => runAction(appointment, 'cancel')} disabled={processing === appointment.public_code}>Hủy lịch</button>}{appointment.status === 'CONFIRMED' && <button type="button" className="button-quiet" onClick={() => runAction(appointment, 'no-show')} disabled={processing === appointment.public_code}>Không đến</button>}</div></article>)}</div>}</section>
    </main>
    {cancelling && <div className="branch-management-modal-backdrop" role="presentation"><form className="branch-management-modal" onSubmit={submitCancellation}><h2>Hủy lịch hẹn</h2><p>Nhập lý do để thông báo cho {cancelling.patient_name}.</p><label>Lý do hủy<textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} required autoFocus /></label><div><button className="button-secondary" type="button" onClick={() => setCancelling(null)}>Quay lại</button><button type="submit" disabled={!cancelReason.trim() || processing === cancelling.public_code}>{processing === cancelling.public_code ? 'Đang hủy…' : 'Xác nhận hủy'}</button></div></form></div>}
  </div>
}
