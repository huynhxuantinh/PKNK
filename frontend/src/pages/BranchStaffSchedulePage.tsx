import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'

import { getBranchDetail } from '../api/booking'
import { ApiError } from '../api/client'
import {
  createManagedTimeOff, createManagedWorkShift, listManagedTimeOffs, listManagedWorkShifts,
  patchManagedTimeOff, patchManagedWorkShift, type ManagedTimeOff, type ManagedWorkShift,
} from '../api/management'
import { useAuth } from '../auth/AuthContext'
import { canAccessArea } from '../auth/roles'
import { ManagementPageHeader } from '../components/branch-management/ManagementPageHeader'
import { ManagementSectionNav } from '../components/branch-management/ManagementSectionNav'
import {
  StaffTimeOffList, StaffWorkShiftList, type ScheduleDentist,
} from '../components/branch-management/StaffScheduleList'
import { hcmDate } from '../components/branch-management/appointmentPresentation'
import { toHcmLocalInput, weekdayLabels } from '../components/branch-management/staffSchedulePresentation'

interface ShiftFormState { dentist_id: string; weekday: string; start_time: string; end_time: string; valid_from: string }
interface TimeOffFormState { dentist_id: string; starts_at: string; ends_at: string; reason: string }
type PendingToggle = { kind: 'shift'; item: ManagedWorkShift } | { kind: 'time-off'; item: ManagedTimeOff }

const emptyShift = (): ShiftFormState => ({ dentist_id: '', weekday: '1', start_time: '08:00', end_time: '17:00', valid_from: hcmDate(new Date()) })
const emptyTimeOff = (): TimeOffFormState => ({ dentist_id: '', starts_at: '', ends_at: '', reason: '' })
const errorMessage = (error: unknown, fallback: string) => error instanceof ApiError || error instanceof Error ? error.message : fallback

export function BranchStaffSchedulePage() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const branchId = Number(params.get('chi-nhanh')) || 0
  const [dentists, setDentists] = useState<ScheduleDentist[]>([])
  const [shifts, setShifts] = useState<ManagedWorkShift[]>([])
  const [offs, setOffs] = useState<ManagedTimeOff[]>([])
  const [shift, setShift] = useState<ShiftFormState>(emptyShift)
  const [off, setOff] = useState<TimeOffFormState>(emptyTimeOff)
  const [editingShiftId, setEditingShiftId] = useState<number | null>(null)
  const [editingOffId, setEditingOffId] = useState<number | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [pendingToggle, setPendingToggle] = useState<PendingToggle | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (!branchId) return
    try {
      const [detail, shiftData, offData] = await Promise.all([getBranchDetail(branchId), listManagedWorkShifts(branchId), listManagedTimeOffs(branchId)])
      setDentists(detail.data.dentists)
      setShifts(shiftData.data)
      setOffs(offData.data)
      setError('')
    } catch (loadError) {
      setError(errorMessage(loadError, 'Không thể tải dữ liệu.'))
    }
  }, [branchId])

  useEffect(() => { void load() }, [load])
  const activeShiftCount = useMemo(() => shifts.filter((item) => item.is_active).length, [shifts])
  const activeOffCount = useMemo(() => offs.filter((item) => item.is_active).length, [offs])
  const resetShiftForm = () => { setShift(emptyShift()); setEditingShiftId(null) }
  const resetOffForm = () => { setOff(emptyTimeOff()); setEditingOffId(null) }

  function editShift(item: ManagedWorkShift) {
    setShift({ dentist_id: String(item.dentist_id), weekday: String(item.weekday), start_time: item.start_time.slice(0, 5), end_time: item.end_time.slice(0, 5), valid_from: item.valid_from })
    setEditingShiftId(item.id_work_shift)
    setNotice('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function editTimeOff(item: ManagedTimeOff) {
    setOff({ dentist_id: String(item.dentist_id), starts_at: toHcmLocalInput(item.starts_at), ends_at: toHcmLocalInput(item.ends_at), reason: item.reason })
    setEditingOffId(item.id_time_off)
    setNotice('')
  }

  async function saveShift(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('')
    const payload = { dentist_id: Number(shift.dentist_id), weekday: Number(shift.weekday), start_time: shift.start_time, end_time: shift.end_time, valid_from: shift.valid_from }
    try {
      if (editingShiftId) { await patchManagedWorkShift(editingShiftId, payload); setNotice('Đã cập nhật ca làm.') }
      else { await createManagedWorkShift(branchId, { ...payload, valid_to: null, is_active: true }); setNotice('Đã tạo ca làm.') }
      resetShiftForm(); await load()
    } catch (saveError) { setError(errorMessage(saveError, 'Không thể lưu ca làm.')) }
  }

  async function saveOff(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('')
    const payload = { dentist_id: Number(off.dentist_id), starts_at: `${off.starts_at}:00+07:00`, ends_at: `${off.ends_at}:00+07:00`, reason: off.reason.trim() }
    try {
      if (editingOffId) { await patchManagedTimeOff(editingOffId, payload); setNotice('Đã cập nhật lịch nghỉ.') }
      else { await createManagedTimeOff(branchId, { ...payload, is_active: true }); setNotice('Đã tạo lịch nghỉ.') }
      resetOffForm(); await load()
    } catch (saveError) { setError(errorMessage(saveError, 'Không thể lưu lịch nghỉ.')) }
  }

  async function confirmToggle() {
    if (!pendingToggle) return
    const { kind, item } = pendingToggle
    const id = kind === 'shift' ? item.id_work_shift : item.id_time_off
    setBusyId(id); setError(''); setNotice('')
    try {
      if (kind === 'shift') await patchManagedWorkShift(item.id_work_shift, { is_active: !item.is_active })
      else await patchManagedTimeOff(item.id_time_off, { is_active: !item.is_active })
      setPendingToggle(null)
      setNotice(item.is_active ? 'Đã ngừng áp dụng.' : 'Đã khôi phục.')
      await load()
    } catch (toggleError) {
      setError(errorMessage(toggleError, 'Không thể cập nhật trạng thái.'))
      setPendingToggle(null)
    } finally { setBusyId(null) }
  }

  if (!canAccessArea(user, 'MANAGEMENT') || !branchId) return <Navigate to="/quan-ly-chi-nhanh" replace />

  return <div className="branch-management-page staff-schedule-page">
    <ManagementPageHeader title="Ca làm & nghỉ phép" path="/quan-ly-chi-nhanh/ca-lam" />
    <main>
    <div className="branch-management-main">
      <Link className="staff-schedule-back" to={`/quan-ly-chi-nhanh?chi-nhanh=${branchId}`}>← Quay lại quản lý chi nhánh</Link>
      <header className="staff-schedule-heading"><div><span className="staff-schedule-kicker">Nhân sự chi nhánh</span><h1>Ca làm & nghỉ phép</h1><p>Sắp xếp thời gian làm việc và ngày vắng mặt của từng nha sĩ.</p></div><div className="staff-schedule-overview" aria-label="Tổng quan lịch làm việc"><span><strong>{activeShiftCount}</strong> ca đang áp dụng</span><span><strong>{activeOffCount}</strong> lịch nghỉ</span></div></header>
      <ManagementSectionNav branchId={branchId} active="staff" />
      {error && <div className="dentist-error" role="alert">{error}</div>}
      {notice && <div className="staff-schedule-notice" role="status">{notice}</div>}

      <section className="branch-management-schedule staff-schedule-section">
        <header><div><span className="staff-schedule-section-index">01</span><h2>Ca làm việc</h2></div><span>{shifts.length} ca</span></header>
        <form className="staff-schedule-form" onSubmit={saveShift}>
          <div className="staff-schedule-form-title"><strong>{editingShiftId ? 'Chỉnh sửa ca làm' : 'Tạo ca mới'}</strong><small>Thời gian theo giờ TP. Hồ Chí Minh.</small></div>
          <label>Nha sĩ<select required value={shift.dentist_id} onChange={(event) => setShift({ ...shift, dentist_id: event.target.value })}><option value="">Chọn nha sĩ</option>{dentists.map((dentist) => <option value={dentist.id_dentist} key={dentist.id_dentist}>{dentist.full_name}</option>)}</select></label>
          <label>Thứ<select value={shift.weekday} onChange={(event) => setShift({ ...shift, weekday: event.target.value })}>{weekdayLabels.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>
          <label>Bắt đầu<input required type="time" value={shift.start_time} onChange={(event) => setShift({ ...shift, start_time: event.target.value })} /></label>
          <label>Kết thúc<input required type="time" value={shift.end_time} onChange={(event) => setShift({ ...shift, end_time: event.target.value })} /></label>
          <label>Áp dụng từ<input required type="date" value={shift.valid_from} onChange={(event) => setShift({ ...shift, valid_from: event.target.value })} /></label>
          <div className="staff-schedule-form-actions"><button type="submit">{editingShiftId ? 'Lưu thay đổi' : 'Tạo ca'}</button>{editingShiftId && <button type="button" className="button-secondary" onClick={resetShiftForm}>Hủy sửa</button>}</div>
        </form>
        <StaffWorkShiftList dentists={dentists} items={shifts} busyId={busyId} onEdit={editShift} onToggle={(item) => setPendingToggle({ kind: 'shift', item })} />
      </section>

      <section className="branch-management-schedule staff-schedule-section">
        <header><div><span className="staff-schedule-section-index">02</span><h2>Nghỉ phép / vắng mặt</h2></div><span>{offs.length} lịch</span></header>
        <form className="staff-schedule-form is-time-off" onSubmit={saveOff}>
          <div className="staff-schedule-form-title"><strong>{editingOffId ? 'Chỉnh sửa lịch nghỉ' : 'Tạo lịch nghỉ'}</strong><small>Hệ thống kiểm tra xung đột với lịch hẹn.</small></div>
          <label>Nha sĩ<select required value={off.dentist_id} onChange={(event) => setOff({ ...off, dentist_id: event.target.value })}><option value="">Chọn nha sĩ</option>{dentists.map((dentist) => <option value={dentist.id_dentist} key={dentist.id_dentist}>{dentist.full_name}</option>)}</select></label>
          <label>Bắt đầu<input required type="datetime-local" value={off.starts_at} onChange={(event) => setOff({ ...off, starts_at: event.target.value })} /></label>
          <label>Kết thúc<input required type="datetime-local" value={off.ends_at} onChange={(event) => setOff({ ...off, ends_at: event.target.value })} /></label>
          <label>Lý do<input required maxLength={500} value={off.reason} onChange={(event) => setOff({ ...off, reason: event.target.value })} /></label>
          <div className="staff-schedule-form-actions"><button type="submit">{editingOffId ? 'Lưu thay đổi' : 'Tạo lịch nghỉ'}</button>{editingOffId && <button type="button" className="button-secondary" onClick={resetOffForm}>Hủy sửa</button>}</div>
        </form>
        <StaffTimeOffList dentists={dentists} items={offs} busyId={busyId} onEdit={editTimeOff} onToggle={(item) => setPendingToggle({ kind: 'time-off', item })} />
      </section>
    </div>

    {pendingToggle && <div className="branch-management-modal-backdrop"><section className="branch-management-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-toggle-title"><h2 id="schedule-toggle-title">Xác nhận thay đổi</h2><p>{pendingToggle.item.is_active ? pendingToggle.kind === 'shift' ? 'Ngừng ca này? Ca sẽ không còn được dùng để xếp lịch.' : 'Xóa lịch nghỉ này? Dữ liệu vẫn được lưu để đối soát.' : 'Khôi phục và áp dụng lại mục này?'}</p><div><button type="button" className="button-secondary" onClick={() => setPendingToggle(null)}>Quay lại</button><button type="button" onClick={() => void confirmToggle()}>Xác nhận</button></div></section></div>}
    </main>
  </div>
}
