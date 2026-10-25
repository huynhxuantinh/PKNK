import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import { listDentistSchedule, startDentistAppointment } from '../api/dentist'
import { getBranchDetail } from '../api/booking'
import { AuthBar } from '../auth/AuthBar'
import { useAuth } from '../auth/AuthContext'
import { activeBranchIdsForRole, hasActiveRole } from '../auth/roles'
import {
  filterDentistSchedule,
  scheduleRange,
  type DentistScheduleView,
} from '../features/dentist/dentistSchedule'
import { Seo } from '../seo/Seo'
import type { BranchDetail, DentistAppointment, DentistAppointmentStatus } from '../types/api'
import {
  formatHcmDay,
  formatHcmTime,
  hcmDate,
  HCM_TIME_ZONE,
  isOnHcmDay,
} from '../utils/hcmDateTime'

const statusLabel: Record<DentistAppointmentStatus, string> = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  CHECKED_IN: 'Đã check-in',
  IN_PROGRESS: 'Đang khám',
  COMPLETED: 'Đã hoàn tất',
  CANCELLED: 'Đã hủy',
  NO_SHOW: 'Không đến',
}

function appointmentInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase()
}

function bookingContactName(appointment: DentistAppointment) {
  return appointment.contact_name_snapshot || appointment.patient_name
}

function bookingContactPhone(appointment: DentistAppointment) {
  return appointment.contact_phone_snapshot || appointment.patient_phone
}

export function DentistDashboardPage() {
  const { isAuthenticated, user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [appointments, setAppointments] = useState<DentistAppointment[] | null>(null)
  const [workingBranches, setWorkingBranches] = useState<BranchDetail[] | null>(null)
  const [error, setError] = useState('')
  const [branchesError, setBranchesError] = useState('')
  const [startingCode, setStartingCode] = useState('')
  const [scheduleView, setScheduleView] = useState<DentistScheduleView>('UPCOMING')
  const [selectedDate, setSelectedDate] = useState(() => hcmDate(new Date()))
  const [dayFilter, setDayFilter] = useState<'ALL' | 'TODAY' | 'TOMORROW'>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | DentistAppointmentStatus>('ALL')
  const selectedBranchId = Number(searchParams.get('chi-nhanh')) || null

  const assignedBranchIds = useMemo(
    () => activeBranchIdsForRole(user, 'DENTIST'),
    [user],
  )

  useEffect(() => {
    if (!isAuthenticated) return
    let active = true
    const { start, end } = scheduleRange(scheduleView, selectedDate)
    setAppointments(null)
    setError('')
    listDentistSchedule(start, end)
      .then((response) => {
        if (active) setAppointments(response.data)
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Không thể tải lịch khám.')
      })
    return () => { active = false }
  }, [isAuthenticated, scheduleView, selectedDate])

  useEffect(() => {
    if (!isAuthenticated) return
    if (assignedBranchIds.length === 0) {
      setWorkingBranches([])
      return
    }
    let active = true
    setWorkingBranches(null)
    setBranchesError('')
    Promise.allSettled(assignedBranchIds.map((branchId) => getBranchDetail(branchId)))
      .then((results) => {
        if (!active) return
        const branches = results.flatMap((result) => (
          result.status === 'fulfilled' ? [result.value.data] : []
        ))
        setWorkingBranches(branches)
        if (branches.length !== assignedBranchIds.length) {
          setBranchesError('Không thể tải đầy đủ thông tin chi nhánh.')
        }
      })
    return () => { active = false }
  }, [assignedBranchIds, isAuthenticated])

  const visibleAppointments = useMemo(
    () => filterDentistSchedule(
      appointments || [], selectedBranchId, scheduleView, 'ALL',
    ),
    [appointments, scheduleView, selectedBranchId],
  )

  const summary = useMemo(() => ({
    total: visibleAppointments.length,
    checkedIn: visibleAppointments.filter((item) => item.status === 'CHECKED_IN').length,
    inProgress: visibleAppointments.filter((item) => item.status === 'IN_PROGRESS').length,
    completed: visibleAppointments.filter((item) => item.status === 'COMPLETED').length,
    noShow: visibleAppointments.filter((item) => item.status === 'NO_SHOW').length,
  }), [visibleAppointments])

  const filteredAppointments = useMemo(() => {
    const anchorDate = new Date(`${selectedDate}T00:00:00+07:00`)
    return filterDentistSchedule(
      appointments || [], selectedBranchId, scheduleView, statusFilter,
    ).filter((appointment) => (
      scheduleView === 'HISTORY'
        || dayFilter === 'ALL'
        || (dayFilter === 'TODAY' && isOnHcmDay(appointment.starts_at, 0, anchorDate))
        || (dayFilter === 'TOMORROW' && isOnHcmDay(appointment.starts_at, 1, anchorDate))
    ))
  }, [appointments, dayFilter, scheduleView, selectedBranchId, selectedDate, statusFilter])

  function changeScheduleView(view: DentistScheduleView) {
    setScheduleView(view)
    setSelectedDate(hcmDate(new Date()))
    setDayFilter('ALL')
    setStatusFilter('ALL')
  }

  async function startAppointment(appointment: DentistAppointment) {
    setStartingCode(appointment.public_code)
    setError('')
    try {
      const response = await startDentistAppointment(appointment.public_code)
      setAppointments((current) => current?.map((item) => (
        item.public_code === appointment.public_code ? response.data : item
      )) || null)
      navigate(`/bac-si/kham/${appointment.public_code}?chi-nhanh=${selectedBranchId}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể bắt đầu lượt khám.')
    } finally {
      setStartingCode('')
    }
  }

  if (!isAuthenticated) return <Navigate to="/dang-nhap?returnTo=%2Fbac-si" replace />
  if (!hasActiveRole(user, ['DENTIST'])) {
    return <Navigate to="/" replace />
  }
  if (!selectedBranchId || !assignedBranchIds.includes(selectedBranchId)) {
    return <Navigate to="/bac-si/chon-chi-nhanh" replace />
  }

  return (
    <div className="dentist-page">
      <Seo title="Khu vực nha sĩ | DentaVie" description="Lịch khám và thao tác chuyên môn dành cho nha sĩ DentaVie." path="/bac-si" noIndex />
      <header className="dentist-header">
        <Link className="brand" to="/" aria-label="Trang chủ DentaVie">
          <img src="/branding/dentavie-logo-horizontal-color.png" alt="DentaVie" />
        </Link>
        <div className="dentist-header-context"><span>Khu vực chuyên môn</span><strong>Nha sĩ</strong></div>
        <AuthBar />
      </header>

      <main className="dentist-main">
        <section className="dentist-welcome">
          <div>
            <p className="eyebrow">Khu vực chuyên môn</p>
            <h1>Chào {user?.full_name || 'bác sĩ'}.</h1>
            <p>{new Intl.DateTimeFormat('vi-VN', { timeZone: HCM_TIME_ZONE, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date())}</p>
          </div>
        </section>

        {error && <div className="dentist-error" role="alert">{error}</div>}

        <section className="dentist-branches" aria-label="Chi nhánh làm việc">
          <header>
            <div>
              <p className="eyebrow">Phân công hiện tại</p>
              <h2>Chi nhánh làm việc</h2>
            </div>
            {workingBranches && <span>{workingBranches.length} chi nhánh</span>}
          </header>
          {branchesError && <p className="dentist-branches-error">{branchesError}</p>}
          {!workingBranches ? <div className="dentist-branches-loading">Đang tải thông tin chi nhánh...</div> : workingBranches.length === 0 ? (
            <div className="dentist-branches-loading">Chưa có chi nhánh được phân công.</div>
          ) : (
            <div className="dentist-branch-grid">
              {workingBranches.filter((branch) => branch.id_branch === selectedBranchId).map((branch) => (
                <article className="dentist-branch-card is-selected" key={branch.id_branch}>
                  <span className="dentist-branch-code">{branch.code}</span>
                  <h3>{branch.name}</h3>
                  <p>{branch.full_address}</p>
                  <dl>
                    <div><dt>Hotline</dt><dd>{branch.phone || 'Chưa cập nhật'}</dd></div>
                    <div><dt>Email</dt><dd>{branch.email || 'Chưa cập nhật'}</dd></div>
                  </dl>
                  <div className="dentist-branch-actions">
                    <span>Đang làm việc tại đây</span>
                    <Link to="/bac-si/chon-chi-nhanh">Đổi chi nhánh →</Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="dentist-stat-grid" aria-label="Tổng quan lịch khám">
          <article><span>{scheduleView === 'UPCOMING' ? 'Tổng lịch hẹn' : 'Tổng lịch sử'}</span><strong>{summary.total}</strong><small>{scheduleView === 'UPCOMING' ? 'trong 7 ngày đang xem' : 'trong ngày đã chọn'}</small></article>
          <article><span>{scheduleView === 'UPCOMING' ? 'Đã check-in' : 'Đã hoàn tất'}</span><strong>{scheduleView === 'UPCOMING' ? summary.checkedIn : summary.completed}</strong><small>{scheduleView === 'UPCOMING' ? 'sẵn sàng khám' : 'ca đã khám xong'}</small></article>
          <article><span>{scheduleView === 'UPCOMING' ? 'Đang khám' : 'Không đến'}</span><strong>{scheduleView === 'UPCOMING' ? summary.inProgress : summary.noShow}</strong><small>{scheduleView === 'UPCOMING' ? 'lượt hiện tại' : 'lịch vắng mặt'}</small></article>
        </section>

        <section className="dentist-schedule-panel">
          <header>
            <div>
              <p className="eyebrow">Lịch làm việc</p>
              <h2>{scheduleView === 'UPCOMING' ? 'Lịch khám sắp tới' : 'Lịch đã khám'}</h2>
            </div>
            {appointments && <span>{filteredAppointments.length} lịch hẹn</span>}
          </header>

          <div className="dentist-schedule-tabs" role="tablist" aria-label="Loại lịch khám">
            <button type="button" role="tab" aria-selected={scheduleView === 'UPCOMING'} className={scheduleView === 'UPCOMING' ? 'is-active' : ''} onClick={() => changeScheduleView('UPCOMING')}>Sắp tới</button>
            <button type="button" role="tab" aria-selected={scheduleView === 'HISTORY'} className={scheduleView === 'HISTORY' ? 'is-active' : ''} onClick={() => changeScheduleView('HISTORY')}>Đã khám</button>
          </div>

          <div className="dentist-schedule-filters" aria-label="Bộ lọc lịch khám">
            <label>{scheduleView === 'UPCOMING' ? 'Bắt đầu từ ngày' : 'Ngày đã khám'}
              <input
                type="date"
                value={selectedDate}
                required
                min={scheduleView === 'UPCOMING' ? hcmDate(new Date()) : undefined}
                max={scheduleView === 'HISTORY' ? hcmDate(new Date()) : undefined}
                onChange={(event) => {
                  if (event.target.value) setSelectedDate(event.target.value)
                }}
              />
            </label>
            {scheduleView === 'UPCOMING' && <label>Khoảng xem
              <select value={dayFilter} onChange={(event) => setDayFilter(event.target.value as typeof dayFilter)}>
                <option value="ALL">7 ngày từ ngày chọn</option>
                <option value="TODAY">Ngày đã chọn</option>
                <option value="TOMORROW">Ngày kế tiếp</option>
              </select>
            </label>}
            <label>Trạng thái
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                <option value="ALL">Tất cả trạng thái</option>
                {scheduleView === 'UPCOMING' ? <>
                  <option value="PENDING">Chờ xác nhận</option>
                  <option value="CONFIRMED">Đã xác nhận</option>
                  <option value="CHECKED_IN">Đã check-in</option>
                  <option value="IN_PROGRESS">Đang khám</option>
                </> : <>
                  <option value="COMPLETED">Đã hoàn tất</option>
                  <option value="NO_SHOW">Không đến</option>
                </>}
              </select>
            </label>
          </div>

          {!appointments && !error ? <div className="dentist-empty">Đang tải lịch khám...</div> : appointments?.length === 0 ? (
            <div className="dentist-empty"><strong>{scheduleView === 'UPCOMING' ? 'Chưa có lịch khám trong khoảng đã chọn.' : 'Chưa có lịch đã khám trong ngày này.'}</strong><span>Chọn ngày khác để tiếp tục tra cứu.</span></div>
          ) : visibleAppointments.length === 0 ? (
            <div className="dentist-empty"><strong>{scheduleView === 'UPCOMING' ? 'Chi nhánh này chưa có lịch khám sắp tới.' : 'Chi nhánh này chưa có ca đã khám trong ngày.'}</strong></div>
          ) : filteredAppointments.length === 0 ? (
            <div className="dentist-empty"><strong>Không có lịch phù hợp với bộ lọc.</strong></div>
          ) : (
            <div className="dentist-appointment-list">
              {filteredAppointments.map((appointment) => (
                <article className="dentist-appointment" key={appointment.public_code}>
                  <time dateTime={appointment.starts_at}><strong>{formatHcmTime(appointment.starts_at)}</strong><span>{formatHcmDay(appointment.starts_at)}</span></time>
                  <div className="dentist-patient-initials" aria-hidden="true">{appointmentInitials(bookingContactName(appointment))}</div>
                  <div className="dentist-appointment-main">
                    <span className="dentist-appointment-branch">{appointment.branch_name}</span>
                    <div className="dentist-appointment-title">
                      <h3>{bookingContactName(appointment)}</h3>
                      <span className={`dentist-status is-${appointment.status.toLowerCase()}`}>{statusLabel[appointment.status]}</span>
                    </div>
                    <p>{appointment.service_name_snapshot}</p>
                    <small>Người đặt: {bookingContactPhone(appointment) || 'Chưa có số điện thoại'}{appointment.contact_email_snapshot ? ` · ${appointment.contact_email_snapshot}` : ''}</small>
                    {appointment.patient_note && <p className="dentist-appointment-note"><strong>Ghi chú:</strong> {appointment.patient_note}</p>}
                  </div>
                  <div className="dentist-appointment-action">
                    {appointment.status === 'CHECKED_IN' ? (
                      <button type="button" className="button dentist-start-button" disabled={startingCode === appointment.public_code} onClick={() => startAppointment(appointment)}>
                        {startingCode === appointment.public_code ? 'Đang mở...' : 'Bắt đầu khám'}
                      </button>
                    ) : appointment.status === 'IN_PROGRESS' ? <Link to={`/bac-si/kham/${appointment.public_code}?chi-nhanh=${selectedBranchId}`}>Tiếp tục khám</Link> : appointment.status === 'COMPLETED' ? <Link to={`/bac-si/kham/${appointment.public_code}?chi-nhanh=${selectedBranchId}`}>Xem bệnh án</Link> : appointment.status === 'NO_SHOW' ? <span>Không đến</span> : <span>Chờ đến lượt</span>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
