import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { type ManagementAppointment, type ManagementAppointmentStatus } from '../api/management'
import { listOrganizationAppointments, listOrganizationBranches, type OrganizationBranch } from '../api/organization'
import { AdminModal, DataTable, EmptyState, StatusBadge } from '../components/admin/ui'
import { OrganizationPageLayout } from '../components/organization-management/OrganizationPageLayout'
import { useOrganizationScope } from '../components/organization-management/useOrganizationScope'
import { appointmentStatusLabels, hcmDate, hcmTime } from '../components/branch-management/appointmentPresentation'

type AppointmentRow = ManagementAppointment & { branchName: string }
type StatusFilter = 'ALL' | ManagementAppointmentStatus

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  ...Object.entries(appointmentStatusLabels).map(([value, label]) => ({ value: value as ManagementAppointmentStatus, label })),
]

function todayHcm() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function endDateHcm(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  const end = new Date(Date.UTC(year, month - 1, day + days))
  return `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}-${String(end.getUTCDate()).padStart(2, '0')}`
}

function statusTone(status: ManagementAppointmentStatus) {
  if (status === 'PENDING' || status === 'HELD') return 'warning' as const
  if (status === 'CHECKED_IN' || status === 'IN_PROGRESS' || status === 'COMPLETED') return 'success' as const
  if (status === 'CANCELLED' || status === 'NO_SHOW' || status === 'EXPIRED') return 'danger' as const
  return 'info' as const
}

export function OrganizationAppointmentsPage() {
  const scope = useOrganizationScope()
  const [branches, setBranches] = useState<OrganizationBranch[]>([])
  const [date, setDate] = useState(todayHcm)
  const [days, setDays] = useState<1 | 7>(1)
  const [branchId, setBranchId] = useState('')
  const [status, setStatus] = useState<StatusFilter>('ALL')
  const [dentistId, setDentistId] = useState('')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<AppointmentRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<AppointmentRow | null>(null)
  const organizationName = scope.options.find((option) => option.id === scope.organizationId)?.name || 'Quản trị tổ chức'

  useEffect(() => {
    if (!scope.organizationId) return
    const controller = new AbortController()
    setBranches([])
    listOrganizationBranches(scope.organizationId, controller.signal)
      .then((response) => { if (!controller.signal.aborted) setBranches(response.data.filter((branch) => branch.is_active)) })
      .catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Không thể tải chi nhánh.') })
    return () => controller.abort()
  }, [scope.organizationId])

  useEffect(() => {
    if (!scope.organizationId) {
      setItems(null)
      setTotal(0)
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setSelected(null)
    const names = new Map(branches.map((branch) => [branch.id_branch, branch.name]))
    listOrganizationAppointments(scope.organizationId, {
      date_from: `${date}T00:00:00+07:00`,
      date_to: `${endDateHcm(date, days)}T00:00:00+07:00`,
      branch_id: branchId ? Number(branchId) : undefined,
      status: status === 'ALL' ? undefined : status,
      dentist_id: dentistId ? Number(dentistId) : undefined,
      query,
      limit: 25,
      offset,
    }, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return
        setItems(response.data.map((appointment) => ({
          ...appointment,
          branchName: names.get(appointment.branch_id) || `Chi nhánh #${appointment.branch_id}`,
        })))
        setTotal(response.meta.count)
      })
      .catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Không thể tải lịch hẹn.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [branchId, branches, date, days, dentistId, offset, query, scope.organizationId, status])

  const dentistOptions = useMemo(() => {
    const source = items || []
    return [...new Map(source.map((item) => [String(item.dentist_id), item.dentist_name])).entries()]
  }, [items])
  const rows = items || []
  const page = Math.floor(offset / 25) + 1
  const pageCount = Math.max(1, Math.ceil(total / 25))

  function resetPage(action: () => void) {
    setOffset(0)
    action()
  }

  return (
    <OrganizationPageLayout organizationId={scope.organizationId} heroKicker="Điều phối toàn chuỗi" heroTitle={organizationName} heroDescription="Giám sát lịch hẹn giữa các chi nhánh. Chọn một chi nhánh để xử lý nghiệp vụ chi tiết." heroAside={<span className="organization-hero-stat">{rows.length} lịch trong phạm vi xem</span>}>
      {error && <div className="dentist-error" role="alert">{error}</div>}
      <section className="branch-management-schedule organization-report-section" aria-labelledby="organization-appointments-title">
        <header><div><span className="branch-report-eyebrow">LỊCH HẸN TOÀN CHUỖI</span><h2 id="organization-appointments-title">Theo dõi lịch khám</h2></div><small>Giám sát · xử lý tại chi nhánh</small></header>
        <div className="organization-filter-grid">
          <label>Ngày bắt đầu<input type="date" value={date} onChange={(event) => resetPage(() => setDate(event.target.value))} /></label>
          <label>Khoảng xem<select value={days} onChange={(event) => resetPage(() => setDays(Number(event.target.value) as 1 | 7))}><option value={1}>Theo ngày</option><option value={7}>7 ngày</option></select></label>
          <label>Chi nhánh<select value={branchId} onChange={(event) => resetPage(() => { setBranchId(event.target.value); setDentistId('') })}><option value="">Tất cả chi nhánh</option>{branches.map((branch) => <option key={branch.id_branch} value={branch.id_branch}>{branch.name}</option>)}</select></label>
          <label>Trạng thái<select value={status} onChange={(event) => resetPage(() => setStatus(event.target.value as StatusFilter))}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>Tìm lịch<input value={query} onChange={(event) => resetPage(() => setQuery(event.target.value))} placeholder="Mã lịch, bệnh nhân, dịch vụ..." /></label>
          <label>Nha sĩ<select value={dentistId} onChange={(event) => resetPage(() => setDentistId(event.target.value))}><option value="">Tất cả nha sĩ</option>{dentistOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        </div>
      </section>

      <section className="branch-management-schedule organization-report-section" aria-label="Danh sách lịch hẹn toàn chuỗi">
        {loading ? <p role="status">Đang tải lịch hẹn các chi nhánh...</p> : <DataTable rows={rows} rowKey={(item) => item.public_code} empty={<EmptyState title="Không có lịch hẹn" description="Không có lịch phù hợp với bộ lọc hiện tại." />} columns={[
          { key: 'time', header: 'Thời gian', cell: (item) => <div className="organization-branch-cell"><strong>{hcmTime(item.starts_at)}</strong><small>{hcmDate(new Date(item.starts_at))}</small></div> },
          { key: 'patient', header: 'Bệnh nhân', cell: (item) => <div className="organization-branch-cell"><strong>{item.patient_name}</strong><small>{item.contact_phone_snapshot || item.patient_phone || 'Chưa có liên hệ'}</small></div> },
          { key: 'service', header: 'Dịch vụ / nha sĩ', cell: (item) => <div className="organization-branch-cell"><strong>{item.service_name_snapshot}</strong><small>{item.dentist_name}</small></div> },
          { key: 'branch', header: 'Chi nhánh', cell: (item) => item.branchName },
          { key: 'status', header: 'Trạng thái', cell: (item) => <StatusBadge tone={statusTone(item.status)}>{appointmentStatusLabels[item.status]}</StatusBadge> },
          { key: 'actions', header: 'Thao tác', className: 'organization-branch-actions-cell', cell: (item) => <div className="organization-row-actions"><button type="button" onClick={() => setSelected(item)}>Chi tiết</button><Link to={`/quan-ly-chi-nhanh/lich-hen?chi-nhanh=${item.branch_id}`}>Xử lý tại chi nhánh</Link></div> },
        ]} />}
        {!loading && total > 0 && <footer className="organization-pagination" aria-label="Phân trang lịch hẹn"><span>Hiển thị {offset + 1}–{Math.min(offset + 25, total)} / {total} lịch</span><div><button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>Trước</button><span>Trang {page}/{pageCount}</span><button type="button" disabled={offset + 25 >= total} onClick={() => setOffset(offset + 25)}>Sau</button></div></footer>}
      </section>

      {selected && <AdminModal open placement="end" className="organization-audit-drawer" title={`Lịch hẹn ${selected.public_code}`} description={`${selected.branchName} · ${hcmDate(new Date(selected.starts_at))} ${hcmTime(selected.starts_at)}`} onClose={() => setSelected(null)}><div className="organization-audit-detail"><dl><div><dt>Bệnh nhân</dt><dd>{selected.patient_name}</dd></div><div><dt>Liên hệ đặt lịch</dt><dd>{selected.contact_name_snapshot || selected.patient_name} · {selected.contact_phone_snapshot || selected.patient_phone || '—'}</dd></div><div><dt>Dịch vụ</dt><dd>{selected.service_name_snapshot}</dd></div><div><dt>Nha sĩ</dt><dd>{selected.dentist_name}</dd></div><div><dt>Trạng thái</dt><dd>{appointmentStatusLabels[selected.status]}</dd></div><div><dt>Thời gian</dt><dd>{hcmTime(selected.starts_at)} – {hcmTime(selected.ends_at)}</dd></div></dl><section><h3>Ghi chú người đặt</h3><p className="organization-hint">{selected.patient_note || 'Không có ghi chú.'}</p></section>{selected.cancel_reason && <section className="organization-warning"><strong>Lý do hủy</strong><br />{selected.cancel_reason}</section>}<Link className="organization-primary-button" to={`/quan-ly-chi-nhanh/lich-hen?chi-nhanh=${selected.branch_id}`}>Mở lịch của chi nhánh</Link></div></AdminModal>}
    </OrganizationPageLayout>
  )
}
