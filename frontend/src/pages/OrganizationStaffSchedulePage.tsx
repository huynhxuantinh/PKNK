import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { listManagedTimeOffs, listManagedWorkShifts, type ManagedTimeOff, type ManagedWorkShift } from '../api/management'
import { listOrganizationBranches, listOrganizationDentists, type OrganizationBranch, type OrganizationDentist } from '../api/organization'
import { DataTable, EmptyState, StatusBadge } from '../components/admin/ui'
import { OrganizationPageLayout } from '../components/organization-management/OrganizationPageLayout'
import { useOrganizationScope } from '../components/organization-management/useOrganizationScope'
import { weekdayLabels } from '../components/branch-management/staffSchedulePresentation'
import { settledMapWithConcurrency } from './organizationStaffScheduleUtils'

type ShiftRow = ManagedWorkShift & { branchName: string; dentistName: string }
type OffRow = ManagedTimeOff & { branchName: string; dentistName: string }

const hcmDateTime = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' })
export function OrganizationStaffSchedulePage() {
  const scope = useOrganizationScope()
  const [branches, setBranches] = useState<OrganizationBranch[]>([])
  const [dentists, setDentists] = useState<OrganizationDentist[]>([])
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [offs, setOffs] = useState<OffRow[]>([])
  const [branchId, setBranchId] = useState('')
  const [dentistId, setDentistId] = useState('')
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const organizationName = scope.options.find((option) => option.id === scope.organizationId)?.name || 'Quản trị tổ chức'

  useEffect(() => {
    if (!scope.organizationId) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    Promise.all([listOrganizationBranches(scope.organizationId, controller.signal), listOrganizationDentists(scope.organizationId, controller.signal)])
      .then(async ([branchResponse, dentistResponse]) => {
        if (controller.signal.aborted) return
        const activeBranches = branchResponse.data.filter((branch) => branch.is_active)
        setBranches(activeBranches)
        setDentists(dentistResponse.data)
        const dentistById = new Map(dentistResponse.data.map((dentist) => [dentist.id_dentist, dentist.full_name || dentist.user_email]))
        // Keep requests bounded until a server-side organization schedule endpoint is available.
        const results = await settledMapWithConcurrency(activeBranches, async (branch) => {
          if (controller.signal.aborted) throw new DOMException('Request aborted', 'AbortError')
          const [shiftResponse, offResponse] = await Promise.all([listManagedWorkShifts(branch.id_branch), listManagedTimeOffs(branch.id_branch)])
          return {
            shifts: shiftResponse.data.map((shift) => ({ ...shift, branchName: branch.name, dentistName: dentistById.get(shift.dentist_id) || `Nha sĩ #${shift.dentist_id}` })),
            offs: offResponse.data.map((off) => ({ ...off, branchName: branch.name, dentistName: dentistById.get(off.dentist_id) || `Nha sĩ #${off.dentist_id}` })),
          }
        }, 3)
        if (controller.signal.aborted) return
        setShifts(results.flatMap((result) => result.status === 'fulfilled' ? result.value.shifts : []))
        const uniqueOffs = new Map<number, OffRow>()
        results.forEach((result) => {
          if (result.status !== 'fulfilled') return
          result.value.offs.forEach((off) => {
            if (!uniqueOffs.has(off.id_time_off)) {
              uniqueOffs.set(off.id_time_off, off.branch_id === null ? { ...off, branchName: 'Toàn chuỗi' } : off)
            }
          })
        })
        setOffs([...uniqueOffs.values()])
        if (results.some((result) => result.status === 'rejected')) setError('Một vài chi nhánh chưa tải được ca làm hoặc lịch nghỉ.')
      })
      .catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Không thể tải lịch làm việc.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [scope.organizationId])

  const matchesFilters = useCallback(
    (item: { branch_id: number | null; dentist_id: number; is_active: boolean }) =>
      (!branchId || item.branch_id === null || item.branch_id === Number(branchId))
      && (!dentistId || item.dentist_id === Number(dentistId))
      && (status === 'ALL' || item.is_active === (status === 'ACTIVE')),
    [branchId, dentistId, status],
  )
  const visibleShifts = useMemo(() => shifts.filter(matchesFilters), [matchesFilters, shifts])
  const visibleOffs = useMemo(() => offs.filter(matchesFilters), [matchesFilters, offs])

  return (
    <OrganizationPageLayout organizationId={scope.organizationId} heroKicker="Nguồn lực toàn chuỗi" heroTitle={organizationName} heroDescription="Theo dõi ca làm và lịch nghỉ giữa các chi nhánh; thay đổi được xử lý tại chi nhánh để bảo toàn lịch hẹn." heroAside={<span className="organization-hero-stat">{visibleShifts.filter((item) => item.is_active).length} ca đang áp dụng</span>}>
      {error && <div className="dentist-error" role="alert">{error}</div>}
      <section className="branch-management-schedule organization-report-section" aria-labelledby="organization-schedule-title">
        <header><div><span className="branch-report-eyebrow">CA LÀM & NGHỈ PHÉP</span><h2 id="organization-schedule-title">Lịch làm việc toàn chuỗi</h2></div><small>{visibleOffs.filter((item) => item.is_active).length} lịch nghỉ đang áp dụng</small></header>
        <div className="organization-filter-grid">
          <label>Chi nhánh<select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Tất cả chi nhánh</option>{branches.map((branch) => <option key={branch.id_branch} value={branch.id_branch}>{branch.name}</option>)}</select></label>
          <label>Nha sĩ<select value={dentistId} onChange={(event) => setDentistId(event.target.value)}><option value="">Tất cả nha sĩ</option>{dentists.map((dentist) => <option key={dentist.id_dentist} value={dentist.id_dentist}>{dentist.full_name || dentist.user_email}</option>)}</select></label>
          <label>Trạng thái<select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="ALL">Tất cả trạng thái</option><option value="ACTIVE">Đang áp dụng</option><option value="INACTIVE">Đã ngưng</option></select></label>
          <div className="organization-filter-actions"><button type="button" className="button-secondary" onClick={() => { setBranchId(''); setDentistId(''); setStatus('ALL') }}>Xóa lọc</button></div>
        </div>
      </section>
      <section className="branch-management-schedule organization-report-section" aria-label="Ca làm nha sĩ">
        <header><div><span className="branch-report-eyebrow">CA LÀM</span><h2>Khung giờ làm việc</h2></div><small>{visibleShifts.length} ca</small></header>
        {loading ? <p role="status">Đang tải ca làm các chi nhánh...</p> : <DataTable rows={visibleShifts} rowKey={(item) => `${item.branch_id}-${item.id_work_shift}`} empty={<EmptyState title="Chưa có ca làm" description="Không có ca làm trong phạm vi lọc hiện tại." />} columns={[
          { key: 'dentist', header: 'Nha sĩ', cell: (item) => item.dentistName },
          { key: 'branch', header: 'Chi nhánh', cell: (item) => item.branchName },
          { key: 'day', header: 'Ngày làm', cell: (item) => weekdayLabels[item.weekday - 1] },
          { key: 'time', header: 'Khung giờ', cell: (item) => `${item.start_time.slice(0, 5)} – ${item.end_time.slice(0, 5)}` },
          { key: 'state', header: 'Trạng thái', cell: (item) => <StatusBadge tone={item.is_active ? 'success' : 'neutral'}>{item.is_active ? 'Đang áp dụng' : 'Đã ngưng'}</StatusBadge> },
          { key: 'action', header: '', className: 'organization-branch-actions-cell', cell: (item) => <Link className="organization-inline-link" to={`/quan-ly-chi-nhanh/ca-lam?chi-nhanh=${item.branch_id}`}>Mở chi nhánh</Link> },
        ]} />}
      </section>
      <section className="branch-management-schedule organization-report-section" aria-label="Lịch nghỉ nha sĩ">
        <header><div><span className="branch-report-eyebrow">NGHỈ PHÉP</span><h2>Thời gian không khả dụng</h2></div><small>{visibleOffs.length} lịch nghỉ</small></header>
        {loading ? <p role="status">Đang tải lịch nghỉ...</p> : <DataTable rows={visibleOffs} rowKey={(item) => `${item.branch_id ?? 'all'}-${item.id_time_off}`} empty={<EmptyState title="Chưa có lịch nghỉ" description="Không có lịch nghỉ trong phạm vi lọc hiện tại." />} columns={[
          { key: 'dentist', header: 'Nha sĩ', cell: (item) => item.dentistName },
          { key: 'branch', header: 'Chi nhánh', cell: (item) => item.branchName },
          { key: 'duration', header: 'Thời gian', cell: (item) => <div className="organization-branch-cell"><strong>{hcmDateTime.format(new Date(item.starts_at))}</strong><small>đến {hcmDateTime.format(new Date(item.ends_at))}</small></div> },
          { key: 'reason', header: 'Lý do', cell: (item) => item.reason },
          { key: 'state', header: 'Trạng thái', cell: (item) => <StatusBadge tone={item.is_active ? 'warning' : 'neutral'}>{item.is_active ? 'Đang áp dụng' : 'Đã ngưng'}</StatusBadge> },
          { key: 'action', header: '', className: 'organization-branch-actions-cell', cell: (item) => item.branch_id && <Link className="organization-inline-link" to={`/quan-ly-chi-nhanh/ca-lam?chi-nhanh=${item.branch_id}`}>Mở chi nhánh</Link> },
        ]} />}
      </section>
    </OrganizationPageLayout>
  )
}
