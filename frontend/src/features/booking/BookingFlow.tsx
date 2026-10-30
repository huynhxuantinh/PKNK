import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import {
  cancelAppointmentHold,
  confirmAppointment,
  createAppointmentHold,
  listBranches,
  listBranchDentists,
  listBranchServices,
  listSlots,
} from '../../api/booking'
import { apiRequest, ApiError } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { isStaffUser } from '../../auth/roles'
import type { Appointment, Branch, BranchDentist, BranchService, PatientProfileResponse, Slot } from '../../types/api'
import {
  bookingSelectionReducer,
  BOOKING_DRAFT_STORAGE_KEY,
  dateInputValue,
  initialBookingSelection,
} from './bookingState'

const currency = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
})

const time = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
})

const fullDateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'full',
  timeStyle: 'short',
})

function LoadingState({ label }: { label: string }) {
  return <p className="state-message state-loading">{label}</p>
}

function EmptyState({ label }: { label: string }) {
  return <p className="state-message">{label}</p>
}

function holdIsNoLongerUsable(reason: unknown) {
  return reason instanceof ApiError && [404, 409].includes(reason.status)
}

interface BookingFlowProps {
  initialBranchId?: number
}

export function BookingFlow({ initialBranchId }: BookingFlowProps) {
  const { user, isAuthenticated, logout } = useAuth()
  const isStaff = isStaffUser(user)
  const location = useLocation()
  const navigate = useNavigate()
  const [selection, dispatch] = useReducer(
    bookingSelectionReducer,
    undefined,
    initialBookingSelection,
  )
  const [branches, setBranches] = useState<Branch[]>([])
  const [services, setServices] = useState<BranchService[]>([])
  const [dentists, setDentists] = useState<BranchDentist[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [query, setQuery] = useState('')
  const [branchQuery, setBranchQuery] = useState('')
  const [branchesLoading, setBranchesLoading] = useState(true)
  const [servicesLoading, setServicesLoading] = useState(false)
  const [dentistsLoading, setDentistsLoading] = useState(false)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [booking, setBooking] = useState(false)
  const [error, setError] = useState('')
  const [heldAppointment, setHeldAppointment] = useState<Appointment | null>(null)
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [patientLoading, setPatientLoading] = useState(false)
  const [isEditingContact, setIsEditingContact] = useState(false)
  const [contact, setContact] = useState({ name: user?.full_name || '', phone: '', email: user?.email || '' })
  const [contactDraft, setContactDraft] = useState(contact)
  const [patientNote, setPatientNote] = useState('')
  const initialBranchApplied = useRef(false)
  const holdMinutes = heldAppointment?.held_at && heldAppointment.expires_at
    ? Math.max(1, Math.round((new Date(heldAppointment.expires_at).getTime() - new Date(heldAppointment.held_at).getTime()) / 60_000))
    : null

  useEffect(() => {
    if (!selection.branch) {
      sessionStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY)
      return
    }
    sessionStorage.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify(selection))
  }, [selection])

  useEffect(() => {
    if (!isAuthenticated || isStaff) {
      return
    }
    setPatientLoading(true)
    apiRequest<PatientProfileResponse>('/patients/me/', {}, { auth: true })
      .then((response) => {
        const nextContact = {
          name: response.data.full_name,
          phone: response.data.phone || '',
          email: response.data.email,
        }
        setContact(nextContact)
        setContactDraft(nextContact)
      })
      .catch(() => {
        const fallback = { name: user?.full_name || '', phone: '', email: user?.email || '' }
        setContact(fallback)
        setContactDraft(fallback)
      })
      .finally(() => setPatientLoading(false))
  }, [isAuthenticated, isStaff, user])

  useEffect(() => {
    const controller = new AbortController()
    setBranchesLoading(true)
    setError('')
    listBranches(branchQuery, controller.signal)
      .then((response) => {
        setBranches(response.data)
        if (!initialBranchApplied.current && initialBranchId) {
          initialBranchApplied.current = true
          const initialBranch = response.data.find((branch) => branch.id_branch === initialBranchId)
          if (initialBranch) dispatch({ type: 'select_branch', branch: initialBranch })
        }
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : 'Không tải được chi nhánh.')
      })
      .finally(() => setBranchesLoading(false))
    return () => controller.abort()
  }, [branchQuery, initialBranchId])

  useEffect(() => {
    if (!selection.branch) {
      setServices([])
      return
    }
    const controller = new AbortController()
    setServicesLoading(true)
    setError('')
    listBranchServices(selection.branch.id_branch, controller.signal)
      .then((response) => setServices(response.data))
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : 'Không tải được dịch vụ.')
      })
      .finally(() => setServicesLoading(false))
    return () => controller.abort()
  }, [selection.branch])

  useEffect(() => {
    if (!selection.service || !selection.date) {
      setSlots([])
      return
    }
    const controller = new AbortController()
    setSlotsLoading(true)
    setError('')
    listSlots(
      selection.service.id_branch_service,
      selection.date,
      controller.signal,
    )
      .then((response) => setSlots(response.data))
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : 'Không tải được slot.')
      })
      .finally(() => setSlotsLoading(false))
    return () => controller.abort()
  }, [selection.date, selection.service])

  useEffect(() => {
    if (!selection.branch || !selection.service) {
      setDentists([])
      return
    }
    const controller = new AbortController()
    setDentistsLoading(true)
    setError('')
    listBranchDentists(
      selection.branch.id_branch,
      selection.service.id_service,
      controller.signal,
    )
      .then((response) => setDentists(response.data))
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : 'Không tải được danh sách bác sĩ.')
      })
      .finally(() => setDentistsLoading(false))
    return () => controller.abort()
  }, [selection.branch, selection.service])

  const availableDentists = selection.slot
    ? dentists.filter((dentist) => selection.slot?.available_dentist_ids.includes(dentist.id_dentist))
    : []
  const displayedBranches = initialBranchId
    ? branches.filter((branch) => branch.id_branch === initialBranchId)
    : branches

  async function confirmHeld(held: Appointment) {
    const response = await confirmAppointment(held.public_code)
    setAppointment(response.data)
    setHeldAppointment(null)
  }

  async function releaseHeldAppointment() {
    if (!heldAppointment) return
    const releasedCode = heldAppointment.public_code
    setHeldAppointment(null)
    try {
      await cancelAppointmentHold(releasedCode)
    } catch {
      // The hold may already have expired or been confirmed; either way it cannot be reused.
    }
    if (selection.service && selection.date) {
      const response = await listSlots(selection.service.id_branch_service, selection.date).catch(() => null)
      if (response) setSlots(response.data)
    }
  }

  function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setContact({
      name: contactDraft.name.trim(),
      phone: contactDraft.phone,
      email: contactDraft.email.trim(),
    })
    setIsEditingContact(false)
  }

  async function handleBooking() {
    if (!selection.service || !selection.slot || !selection.dentist) return
    if (!isAuthenticated) {
      setError('Bạn cần đăng nhập trước khi đặt lịch.')
      return
    }
    if (!user?.email_verified) {
      setError('Bạn cần xác minh email trước khi đặt lịch.')
      return
    }

    setBooking(true)
    setError('')
    let createdHold: Appointment | null = null
    try {
      const hold = await createAppointmentHold(
        selection.service.id_branch_service,
        selection.slot.starts_at,
        selection.dentist.id_dentist,
        {
          contactName: contact.name,
          contactPhone: contact.phone,
          contactEmail: contact.email,
          patientNote,
        },
      )
      createdHold = hold.data
      setHeldAppointment(hold.data)
      await confirmHeld(hold.data)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) logout()
      const message = reason instanceof Error ? reason.message : 'Không thể đặt lịch.'
      if (createdHold && holdIsNoLongerUsable(reason)) {
        setHeldAppointment(null)
        await cancelAppointmentHold(createdHold.public_code).catch(() => undefined)
        if (selection.service && selection.date) {
          const response = await listSlots(
            selection.service.id_branch_service,
            selection.date,
          ).catch(() => null)
          if (response) setSlots(response.data)
        }
        setError(`${message} Chỗ giữ không còn hiệu lực, vui lòng chọn giờ khác.`)
      } else if (createdHold) {
        setError(`${message} Chỗ của bạn vẫn đang được giữ, hãy thử xác nhận lại.`)
      } else {
        setError(message)
        if (selection.service && selection.date) {
          const response = await listSlots(
            selection.service.id_branch_service,
            selection.date,
          ).catch(() => null)
          if (response) setSlots(response.data)
        }
      }
    } finally {
      setBooking(false)
    }
  }

  async function retryConfirmation() {
    if (!heldAppointment) return
    setBooking(true)
    setError('')
    try {
      await confirmHeld(heldAppointment)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) logout()
      const message = reason instanceof Error ? reason.message : 'Không thể xác nhận lịch.'
      if (holdIsNoLongerUsable(reason)) {
        await releaseHeldAppointment()
        setError(`${message} Chỗ giữ không còn hiệu lực, vui lòng chọn giờ khác.`)
      } else {
        setError(`${message} Chỗ của bạn vẫn đang được giữ, hãy thử xác nhận lại.`)
      }
    } finally {
      setBooking(false)
    }
  }

  if (isStaff) {
    return (
      <section className="booking-role-blocked" role="alert">
        <h2>Tài khoản nhân viên không thể đặt lịch</h2>
        <p>Vui lòng sử dụng tài khoản bệnh nhân để đặt lịch khám.</p>
        <Link to="/">Về trang phù hợp</Link>
      </section>
    )
  }

  if (appointment) {
    return (
      <section className="booking-success" aria-live="polite">
        <div className="booking-success-lead">
          <p className="eyebrow">Đặt lịch thành công</p>
          <h2>Hẹn gặp bạn<br />tại {selection.branch?.name || 'DentaVie'}.</h2>
          <p className="booking-success-copy">Lịch hẹn đã được ghi nhận. DentaVie sẽ chuẩn bị sẵn sàng để đón bạn.</p>
          <div className="booking-success-code">
            <span>Mã lịch hẹn</span>
            <strong>{appointment.public_code}</strong>
          </div>
          <button
            className="button booking-success-action"
            type="button"
            onClick={() => {
              setAppointment(null)
              setPatientNote('')
              dispatch({ type: 'reset' })
              navigate('/')
            }}
          >
            Về trang chủ
          </button>
        </div>

        <div className="booking-success-details">
          <header>
            <div>
              <span>Thông tin lịch hẹn</span>
              <strong>{appointment.service_name_snapshot}</strong>
            </div>
            <b>{appointment.status === 'CONFIRMED' ? 'Đã xác nhận' : 'Chờ xác nhận'}</b>
          </header>
          <dl>
            <div><dt>Thời gian</dt><dd>{fullDateTime.format(new Date(appointment.starts_at))}</dd></div>
            <div><dt>Nha sĩ</dt><dd>{appointment.dentist_name}</dd></div>
            <div><dt>Người đặt</dt><dd>{appointment.contact_name_snapshot || contact.name}</dd></div>
            {selection.branch && <div><dt>Chi nhánh</dt><dd>{selection.branch.full_address}</dd></div>}
            {appointment.patient_note && <div className="booking-success-note"><dt>Ghi chú</dt><dd>{appointment.patient_note}</dd></div>}
          </dl>
        </div>
      </section>
    )
  }

  return (
    <div className="booking-layout booking-layout--refined">
      <div className="booking-main">
        {error && <div className="error-banner" role="alert">{error}</div>}

        <div className="booking-context-grid">
          <section className="flow-section booking-panel booking-panel-branch">
          <div className="section-heading">
            <div><h2>{initialBranchId ? 'Chi nhánh đã chọn' : 'Chọn chi nhánh'}</h2></div>
            {!initialBranchId && <form
              className="search-form"
              onSubmit={(event) => {
                event.preventDefault()
                setBranchQuery(query)
              }}
            >
              <input
                aria-label="Tìm chi nhánh"
                placeholder="Tên hoặc địa chỉ…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button className="button button-secondary">Tìm</button>
            </form>}
          </div>
          {branchesLoading ? <LoadingState label="Đang tải chi nhánh…" /> : displayedBranches.length === 0 ? <EmptyState label="Không tìm thấy chi nhánh phù hợp." /> : (
            <div className={`card-grid ${initialBranchId ? 'fixed-branch-grid' : ''}`}>
              {displayedBranches.map((branch) => (
                <button
                  type="button"
                  key={branch.id_branch}
                  className={`choice-card ${selection.branch?.id_branch === branch.id_branch ? 'selected' : ''}`}
                  onClick={() => {
                    if (!initialBranchId) dispatch({ type: 'select_branch', branch })
                  }}
                  aria-disabled={Boolean(initialBranchId)}
                >
                  <span className={`status-dot ${branch.is_open_now ? 'open' : ''}`} />
                  <strong>{branch.name}</strong>
                  <span>{branch.full_address}</span>
                  <small>{branch.is_open_now ? 'Đang mở cửa' : 'Hiện đang đóng cửa'}</small>
                </button>
              ))}
            </div>
          )}
          </section>

          <section className={`flow-section booking-panel booking-panel-contact ${!selection.branch ? 'disabled-section' : ''}`}>
          <div className="section-heading">
            <div><h2>Thông tin liên hệ</h2></div>
            {user && !isEditingContact && <button className="booking-profile-link" type="button" onClick={() => { setContactDraft(contact); setIsEditingContact(true) }}>Chỉnh sửa</button>}
          </div>
          {!isAuthenticated ? <EmptyState label="Vui lòng đăng nhập để tiếp tục đặt lịch." /> : patientLoading ? <LoadingState label="Đang tải thông tin người đặt…" /> : (
            isEditingContact ? (
              <form className="booking-contact-editor" onSubmit={saveContact}>
                <label>Họ và tên<input value={contactDraft.name} onChange={(event) => setContactDraft({ ...contactDraft, name: event.target.value })} required /></label>
                <label>Số điện thoại<input type="tel" inputMode="tel" pattern="\+?[0-9]{9,15}" value={contactDraft.phone} onChange={(event) => setContactDraft({ ...contactDraft, phone: event.target.value.replace(/[\s-]/g, '') })} required /></label>
                <label>Email<input type="email" value={contactDraft.email} onChange={(event) => setContactDraft({ ...contactDraft, email: event.target.value })} required /></label>
                <div className="booking-contact-actions">
                  <button type="submit" className="button button-primary">Xong</button>
                  <button type="button" className="button button-quiet" onClick={() => { setContactDraft(contact); setIsEditingContact(false) }}>Hủy</button>
                </div>
              </form>
            ) : (
              <div className="booking-patient-card">
                <div><span>Họ và tên</span><strong>{contact.name || 'Chưa cập nhật'}</strong></div>
                <div><span>Số điện thoại</span><strong>{contact.phone || 'Chưa cập nhật'}</strong></div>
                <div><span>Email</span><strong>{contact.email || 'Chưa cập nhật'}</strong></div>
              </div>
            )
          )}
          </section>
        </div>

        <section className={`flow-section booking-panel ${!selection.branch ? 'disabled-section' : ''}`}>
          <div className="section-heading"><div><h2>Chọn dịch vụ</h2></div></div>
          {!selection.branch ? <EmptyState label="Hãy chọn chi nhánh trước." /> : servicesLoading ? <LoadingState label="Đang tải dịch vụ…" /> : services.length === 0 ? <EmptyState label="Chi nhánh chưa có dịch vụ khả dụng." /> : (
            <div className="service-list">
              {services.map((service) => (
                <button
                  type="button"
                  key={service.id_branch_service}
                  className={`service-row ${selection.service?.id_branch_service === service.id_branch_service ? 'selected' : ''}`}
                  onClick={() => dispatch({ type: 'select_service', service })}
                >
                  <span><strong>{service.name}</strong><small>{service.duration_minutes} phút</small></span>
                  <b>{currency.format(Number(service.price))}</b>
                </button>
              ))}
            </div>
          )}
          {selection.service && (
            <label className="booking-note-field">
              <span>Ghi chú triệu chứng <small>(không bắt buộc)</small></span>
              <textarea maxLength={1000} rows={4} value={patientNote} onChange={(event) => setPatientNote(event.target.value)} placeholder="Ví dụ: Đau răng số 7 bên phải, đau nhiều khi nhai..." />
              <small>{patientNote.length}/1000 ký tự</small>
            </label>
          )}
        </section>

        <section className={`flow-section booking-panel ${!selection.service ? 'disabled-section' : ''}`}>
          <div className="section-heading">
            <div><h2>Chọn ngày và giờ</h2></div>
            <label className="date-field">Ngày khám<input type="date" min={dateInputValue()} max={dateInputValue(90)} value={selection.date} onChange={(event) => dispatch({ type: 'select_date', date: event.target.value })} disabled={!selection.service} /></label>
          </div>
          {!selection.service ? <EmptyState label="Hãy chọn dịch vụ trước." /> : slotsLoading ? <LoadingState label="Đang kiểm tra lịch trống…" /> : slots.length === 0 ? <EmptyState label="Ngày này chưa còn khung giờ phù hợp. Hãy chọn ngày khác." /> : (
            <div className="slot-grid">
              {slots.map((slot) => (
                <button type="button" key={slot.starts_at} className={`slot-button ${selection.slot?.starts_at === slot.starts_at ? 'selected' : ''}`} onClick={() => dispatch({ type: 'select_slot', slot })}>
                  {time.format(new Date(slot.starts_at))}
                  <small>{slot.available_dentist_count} nha sĩ</small>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={`flow-section booking-panel ${!selection.slot ? 'disabled-section' : ''}`}>
          <div className="section-heading">
            <div><h2>Chọn bác sĩ</h2></div>
          </div>
          {!selection.slot ? <EmptyState label="Hãy chọn ngày và khung giờ trước." /> : dentistsLoading ? <LoadingState label="Đang tải bác sĩ phù hợp…" /> : availableDentists.length === 0 ? <EmptyState label="Không còn bác sĩ phù hợp trong khung giờ này. Hãy chọn giờ khác." /> : (
            <div className="dentist-choice-grid">
              {availableDentists.map((dentist) => (
                <button
                  type="button"
                  key={dentist.id_dentist}
                  className={`dentist-choice ${selection.dentist?.id_dentist === dentist.id_dentist ? 'selected' : ''}`}
                  onClick={() => dispatch({ type: 'select_dentist', dentist })}
                >
                  <span className="dentist-choice-avatar" aria-hidden="true">
                    {dentist.full_name.split(' ').slice(-2).map((part) => part[0]).join('')}
                  </span>
                  <span>
                    <strong>{dentist.full_name}</strong>
                    <small>CCHN: {dentist.license_number}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="booking-summary booking-summary--refined">
        <h2>Tóm tắt lịch hẹn</h2>
        <dl>
          <div><dt>Người đặt</dt><dd>{contact.name || 'Chưa đăng nhập'}{contact.phone ? <small className="summary-subvalue">{contact.phone}</small> : null}</dd></div>
          <div><dt>Chi nhánh</dt><dd>{selection.branch?.name || 'Chưa chọn'}</dd></div>
          <div><dt>Dịch vụ</dt><dd>{selection.service?.name || 'Chưa chọn'}</dd></div>
          <div><dt>Ngày giờ</dt><dd>{selection.slot ? fullDateTime.format(new Date(selection.slot.starts_at)) : 'Chưa chọn'}</dd></div>
          <div><dt>Bác sĩ</dt><dd>{selection.dentist?.full_name || 'Chưa chọn'}</dd></div>
          <div><dt>Chi phí dự kiến</dt><dd>{selection.service ? currency.format(Number(selection.service.price)) : '—'}</dd></div>
          {patientNote && <div><dt>Ghi chú</dt><dd>{patientNote}</dd></div>}
        </dl>
        {!isAuthenticated && <p className="summary-note">Đăng nhập ở góc trên để hoàn tất đặt lịch.</p>}
        {user && !user.email_verified && (
          <p className="summary-note warning">
            Email cần được xác minh trước khi đặt.{' '}
            <Link
              className="summary-note-link"
              to={`/xac-minh-email?returnTo=${encodeURIComponent(`${location.pathname}${location.search}${location.hash}`)}`}
            >
              Xác minh email
            </Link>
          </p>
        )}
        {heldAppointment ? (
          <div className="booking-held-actions"><button className="button button-primary button-wide" type="button" disabled={booking} onClick={retryConfirmation}>{booking ? 'Đang xác nhận…' : 'Xác nhận chỗ đang giữ'}</button><button className="button button-secondary button-wide" type="button" disabled={booking} onClick={() => void releaseHeldAppointment()}>Chọn giờ khác</button></div>
        ) : (
          <button className="button button-primary button-wide" type="button" disabled={!selection.dentist || !contact.name || !contact.phone || !contact.email || booking} onClick={handleBooking}>
            {booking ? 'Đang giữ chỗ…' : 'Đặt lịch ngay'}
          </button>
        )}
        <small className="policy-note">{holdMinutes ? `Chỗ của bạn được giữ trong ${holdMinutes} phút để xác nhận.` : 'Thời gian giữ chỗ được áp dụng theo chính sách của chi nhánh.'}</small>
      </aside>
    </div>
  )
}
