import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'

import { createPayosPayment } from '../api/billing'
import { apiRequest, downloadAuthenticatedFile } from '../api/client'
import { listSlots } from '../api/booking'
import { AuthBar } from '../auth/AuthBar'
import { useAuth } from '../auth/AuthContext'
import { AuthenticatedThumbnail } from '../components/clinical/AuthenticatedThumbnail'
import { PatientInvoiceActions } from '../components/billing/PatientInvoiceActions'
import { Seo } from '../seo/Seo'
import type {
  PatientAppointment,
  PatientAppointmentsResponse,
  PatientClinicalEncounter,
  PatientClinicalEncountersResponse,
  PatientAppointmentStatus,
  PatientInvoice,
  PatientInvoicesResponse,
  Notification,
  NotificationsResponse,
  Slot,
} from '../types/api'

const appointmentStatus: Record<PatientAppointmentStatus, string> = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  CHECKED_IN: 'Đã đến',
  IN_PROGRESS: 'Đang khám',
  COMPLETED: 'Đã hoàn thành',
  CANCELLED: 'Đã hủy',
  NO_SHOW: 'Không đến',
}

function formatDateTime(value: string | null) {
  if (!value) return 'Chưa cập nhật'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function RecordsLayout({
  title,
  description,
  path,
  children,
}: {
  title: string
  description: string
  path: string
  children: ReactNode
}) {
  return (
    <div className="site-shell patient-records-page">
      <Seo title={`${title} | DentaVie`} description={description} path={path} noIndex />
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Trang chủ DentaVie">
          <img src="/branding/dentavie-logo-horizontal-color.png" alt="DentaVie" />
        </Link>
        <nav className="main-nav" aria-label="Điều hướng chính">
          <Link to="/">Trang chủ</Link>
          <Link to="/dat-lich">Đặt lịch khám</Link>
          <Link to="/bang-gia">Bảng giá</Link>
        </nav>
        <AuthBar />
      </header>
      <main className="patient-records-main">
        <header className="patient-records-heading">
          <p className="eyebrow">Tài khoản của tôi</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        {children}
      </main>
    </div>
  )
}

function RecordState({ children }: { children: ReactNode }) {
  return <div className="patient-record-state">{children}</div>
}

export function PatientAppointmentsPage() {
  const { isAuthenticated } = useAuth()
  const [appointments, setAppointments] = useState<PatientAppointment[] | null>(null)
  const [meta, setMeta] = useState<PatientAppointmentsResponse['meta'] | null>(null)
  const [scope, setScope] = useState<'UPCOMING' | 'HISTORY'>('UPCOMING')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [cancellingCode, setCancellingCode] = useState('')
  const [cancellingAppointment, setCancellingAppointment] = useState<PatientAppointment | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [rescheduling, setRescheduling] = useState<PatientAppointment | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [slotOptions, setSlotOptions] = useState<Slot[] | null>(null)
  const [rescheduleError, setRescheduleError] = useState('')

  const loadAppointments = useCallback(async () => {
    if (!isAuthenticated) return
    setAppointments(null)
    setError('')
    try {
      const response = await apiRequest<PatientAppointmentsResponse>(
        `/patients/me/appointments/?scope=${scope}&page=${page}&page_size=10`,
        {},
        { auth: true },
      )
      setAppointments(response.data)
      setMeta(response.meta)
    } catch {
      setError('Không thể tải lịch hẹn. Vui lòng thử lại.')
    }
  }, [isAuthenticated, page, scope])

  useEffect(() => {
    void loadAppointments()
  }, [loadAppointments])

  function changeScope(nextScope: 'UPCOMING' | 'HISTORY') {
    setScope(nextScope)
    setPage(1)
    setNotice('')
  }

  async function findRescheduleSlots() {
    if (!rescheduling || !rescheduleDate) return
    setRescheduleError('')
    setSlotOptions(null)
    try {
      const response = await listSlots(rescheduling.branch_service_id, rescheduleDate)
      setSlotOptions(response.data)
    } catch (reason) {
      setRescheduleError(reason instanceof Error ? reason.message : 'Không thể tìm giờ trống.')
    }
  }

  async function rescheduleAppointment(slot: Slot) {
    if (!rescheduling) return
    setRescheduleError('')
    try {
      await apiRequest<{ data: PatientAppointment }>(
        `/patients/me/appointments/${rescheduling.public_code}/reschedule/`,
        { method: 'POST', body: JSON.stringify({ starts_at: slot.starts_at, reason: 'Người bệnh chủ động đổi lịch.', idempotency_key: `patient-${crypto.randomUUID()}` }) },
        { auth: true },
      )
      setRescheduling(null)
      setSlotOptions(null)
      setNotice('Đã tạo lịch hẹn mới theo thời gian bạn chọn.')
      await loadAppointments()
    } catch (reason) {
      setRescheduleError(reason instanceof Error ? reason.message : 'Không thể đổi lịch. Vui lòng thử lại.')
    }
  }

  async function cancelAppointment() {
    if (!cancellingAppointment || !cancelReason.trim()) return
    const appointment = cancellingAppointment
    setCancellingCode(appointment.public_code)
    setError('')
    setNotice('')
    try {
      await apiRequest<{ data: PatientAppointment }>(
        `/patients/me/appointments/${appointment.public_code}/cancel/`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: cancelReason.trim() }),
        },
        { auth: true },
      )
      setNotice('Đã hủy lịch khám.')
      setCancellingAppointment(null)
      setCancelReason('')
      await loadAppointments()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể hủy lịch. Vui lòng thử lại.')
    } finally {
      setCancellingCode('')
    }
  }

  if (!isAuthenticated) {
    return <Navigate to="/dang-nhap?returnTo=%2Flich-hen" replace />
  }

  return (
    <RecordsLayout
      title="Lịch đã đặt"
      description={scope === 'UPCOMING' ? 'Theo dõi các lịch khám sắp tới của bạn.' : 'Xem các lịch đã hoàn thành, đã hủy hoặc không đến.'}
      path="/lich-hen"
    >
      {notice && <p className="patient-record-notice" role="status">{notice}</p>}
      <div className="patient-record-tabs" role="tablist" aria-label="Loại lịch hẹn">
        <button type="button" role="tab" aria-selected={scope === 'UPCOMING'} className={scope === 'UPCOMING' ? 'is-active' : ''} onClick={() => changeScope('UPCOMING')}>Lịch sắp tới</button>
        <button type="button" role="tab" aria-selected={scope === 'HISTORY'} className={scope === 'HISTORY' ? 'is-active' : ''} onClick={() => changeScope('HISTORY')}>Lịch sử lịch hẹn</button>
      </div>
      {error ? <RecordState>{error}</RecordState> : appointments === null ? (
        <RecordState>Đang tải lịch hẹn...</RecordState>
      ) : appointments.length === 0 ? (
        <RecordState>
          <strong>{scope === 'UPCOMING' ? 'Bạn chưa có lịch khám sắp tới.' : 'Chưa có lịch sử lịch hẹn.'}</strong>
          {scope === 'UPCOMING' && <Link className="button button-primary" to="/dat-lich">Đặt lịch khám</Link>}
        </RecordState>
      ) : (
        <>
          <div className="patient-record-list">
            {appointments.map((appointment) => (
            <article className="patient-record-card appointment-record" key={appointment.public_code}>
              <time dateTime={appointment.starts_at}>
                <strong>{new Intl.DateTimeFormat('vi-VN', { day: '2-digit' }).format(new Date(appointment.starts_at))}</strong>
                <span>{new Intl.DateTimeFormat('vi-VN', { month: 'short' }).format(new Date(appointment.starts_at))}</span>
              </time>
              <div className="patient-record-content">
                <div className="patient-record-title-row">
                  <h2>{appointment.service_name_snapshot}</h2>
                  <span className={`record-status status-${appointment.status.toLowerCase()}`}>
                    {appointmentStatus[appointment.status]}
                  </span>
                </div>
                <p className="record-branch">{appointment.branch_name}</p>
                <dl className="record-meta">
                  <div><dt>Thời gian</dt><dd>{formatDateTime(appointment.starts_at)}</dd></div>
                  <div><dt>Bác sĩ</dt><dd>{appointment.dentist_name || 'Phòng khám sắp xếp'}</dd></div>
                  <div><dt>Địa chỉ</dt><dd>{appointment.branch_address}</dd></div>
                  {appointment.patient_note && <div><dt>Ghi chú</dt><dd>{appointment.patient_note}</dd></div>}
                </dl>
                {appointment.can_cancel && (
                  <div className="appointment-record-actions">
                    <button type="button" disabled={cancellingCode === appointment.public_code} onClick={() => { setCancellingAppointment(appointment); setCancelReason('') }}>
                      {cancellingCode === appointment.public_code ? 'Đang hủy...' : 'Hủy lịch'}
                    </button>
                  </div>
                )}
                {!appointment.can_cancel && ['PENDING', 'CONFIRMED'].includes(appointment.status) && (
                  <p className="appointment-action-note">Đã qua thời hạn hủy trực tuyến. Vui lòng liên hệ chi nhánh để được hỗ trợ.</p>
                )}
                {appointment.can_reschedule && (
                  <div className="appointment-record-actions">
                    <button type="button" onClick={() => { setRescheduling(appointment); setRescheduleDate(''); setSlotOptions(null); setRescheduleError('') }}>Đổi lịch</button>
                  </div>
                )}
              </div>
            </article>
            ))}
          </div>
          {rescheduling && (
            <section className="reschedule-panel" aria-label="Đổi lịch hẹn">
              <div><strong>Đổi lịch: {rescheduling.service_name_snapshot}</strong><button type="button" onClick={() => setRescheduling(null)}>Đóng</button></div>
              <label>Chọn ngày<input type="date" value={rescheduleDate} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setRescheduleDate(event.target.value)} /></label>
              <button type="button" disabled={!rescheduleDate} onClick={findRescheduleSlots}>Tìm giờ trống</button>
              {rescheduleError && <p className="patient-record-error">{rescheduleError}</p>}
              {slotOptions && (slotOptions.length ? <div className="reschedule-slots">{slotOptions.map((slot) => <button type="button" key={slot.starts_at} onClick={() => rescheduleAppointment(slot)}>{formatDateTime(slot.starts_at)}</button>)}</div> : <p>Không còn giờ trống trong ngày này.</p>)}
            </section>
          )}
          {cancellingAppointment && (
            <div className="appointment-modal-backdrop" role="presentation">
              <form className="appointment-modal" onSubmit={(event) => { event.preventDefault(); void cancelAppointment() }}>
                <h2>Hủy lịch khám</h2>
                <p>{cancellingAppointment.service_name_snapshot} · {formatDateTime(cancellingAppointment.starts_at)}</p>
                <label>Lý do hủy<textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={1000} required autoFocus placeholder="Ví dụ: Có việc đột xuất, cần hủy lịch." /></label>
                <div><button type="button" onClick={() => setCancellingAppointment(null)}>Quay lại</button><button type="submit" disabled={!cancelReason.trim() || cancellingCode === cancellingAppointment.public_code}>{cancellingCode === cancellingAppointment.public_code ? 'Đang hủy...' : 'Xác nhận hủy lịch'}</button></div>
              </form>
            </div>
          )}
          {meta && meta.total_pages > 1 && (
            <nav className="patient-record-pagination" aria-label="Phân trang lịch hẹn">
              <button type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Trước</button>
              <span>Trang {meta.page} / {meta.total_pages}</span>
              <button type="button" disabled={page === meta.total_pages} onClick={() => setPage((current) => current + 1)}>Sau</button>
            </nav>
          )}
        </>
      )}
    </RecordsLayout>
  )
}

export function PatientHistoryPage() {
  const { isAuthenticated } = useAuth()
  const [encounters, setEncounters] = useState<PatientClinicalEncounter[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isAuthenticated) return
    apiRequest<PatientClinicalEncountersResponse>(
      '/patients/me/clinical-encounters/',
      {},
      { auth: true },
    )
      .then((response) => setEncounters(response.data))
      .catch(() => setError('Không thể tải lịch sử khám. Vui lòng thử lại.'))
  }, [isAuthenticated])

  if (!isAuthenticated) {
    return <Navigate to="/dang-nhap?returnTo=%2Flich-su-kham" replace />
  }

  return (
    <RecordsLayout
      title="Lịch sử khám"
      description="Xem lại các lần khám và thông tin chuyên môn đã hoàn tất."
      path="/lich-su-kham"
    >
      {error ? <RecordState>{error}</RecordState> : encounters === null ? (
        <RecordState>Đang tải lịch sử khám...</RecordState>
      ) : encounters.length === 0 ? (
        <RecordState><strong>Chưa có hồ sơ khám đã hoàn tất.</strong></RecordState>
      ) : (
        <div className="patient-record-list">
          {encounters.map((encounter) => (
            <article className="patient-record-card history-record" key={encounter.id_clinical_encounter}>
              <div className="patient-record-title-row">
                <div>
                  <p className="record-date">{formatDateTime(encounter.completed_at || encounter.finalized_at)}</p>
                  <h2>{encounter.service_name}</h2>
                </div>
                <span className="record-status status-completed">Đã hoàn tất</span>
              </div>
              <p className="record-branch">{encounter.branch_name} · {encounter.dentist_name}</p>
              <dl className="record-meta history-meta">
                <div><dt>Lý do khám</dt><dd>{encounter.chief_complaint || 'Không có ghi chú'}</dd></div>
                <div><dt>Chẩn đoán</dt><dd>{encounter.diagnosis_summary || 'Chưa cập nhật'}</dd></div>
              </dl>
              {encounter.aftercare_instructions && (
                <section className="record-aftercare" aria-label="Dặn dò sau khám">
                  <strong>Dặn dò sau khám</strong>
                  <p>{encounter.aftercare_instructions}</p>
                </section>
              )}
              {encounter.attachments.length > 0 && (
                <div className="record-attachments">
                  <strong>Hình ảnh và tệp bệnh án</strong>
                  <div className="record-thumbnail-grid">
                    {encounter.attachments.filter((attachment) => attachment.content_type.startsWith('image/')).map((attachment) => (
                      <article key={attachment.id_clinical_attachment}>
                        <button className="record-thumbnail" type="button" aria-label={`Tải ${attachment.description || 'ảnh bệnh án'}`} onClick={() => downloadAuthenticatedFile(attachment.download_url, `${attachment.kind}-${attachment.id_clinical_attachment}`)}>
                          <AuthenticatedThumbnail attachment={attachment} />
                        </button>
                        <div><span>{attachment.kind === 'XRAY' ? 'X-quang' : 'Ảnh lâm sàng'}</span><p>{attachment.description || 'Không có mô tả'}</p></div>
                      </article>
                    ))}
                  </div>
                  {encounter.attachments.filter((attachment) => !attachment.content_type.startsWith('image/')).map((attachment) => <button type="button" key={attachment.id_clinical_attachment} onClick={() => downloadAuthenticatedFile(attachment.download_url, `${attachment.kind}-${attachment.id_clinical_attachment}`)}>{attachment.description || attachment.kind} · Tải xuống</button>)}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </RecordsLayout>
  )
}

export function PatientInvoicesPage() {
  const { isAuthenticated } = useAuth()
  const [searchParams] = useSearchParams()
  const [invoices, setInvoices] = useState<PatientInvoice[] | null>(null)
  const [error, setError] = useState('')
  const [busyInvoiceId, setBusyInvoiceId] = useState<number | null>(null)
  useEffect(() => {
    if (!isAuthenticated) return
    apiRequest<PatientInvoicesResponse>('/patients/me/invoices/?page=1&page_size=20', {}, { auth: true }).then((response) => setInvoices(response.data)).catch(() => setError('Không thể tải hóa đơn.'))
  }, [isAuthenticated])
  async function payInvoice(invoiceId: number) {
    setError('')
    setBusyInvoiceId(invoiceId)
    try {
      const response = await createPayosPayment(invoiceId)
      window.location.assign(response.data.checkout_url)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể tạo liên kết thanh toán.')
      setBusyInvoiceId(null)
    }
  }
  if (!isAuthenticated) return <Navigate to="/dang-nhap?returnTo=%2Fhoa-don" replace />
  return <RecordsLayout title="Hóa đơn" description="Theo dõi các hóa đơn đã phát hành." path="/hoa-don">
    {searchParams.get('huy') === '1' && <p className="patient-record-notice">Bạn đã hủy thanh toán. Hóa đơn vẫn đang chờ thanh toán.</p>}
    {error && <p className="patient-record-error" role="alert">{error}</p>}
    {invoices === null ? <RecordState>Đang tải hóa đơn...</RecordState> : invoices.length === 0 ? <RecordState><strong>Chưa có hóa đơn.</strong></RecordState> : <div className="patient-record-list">{invoices.map((invoice) => <article className="patient-record-card invoice-record" key={invoice.id_invoice}><div><h2>{invoice.invoice_number}</h2><p>{invoice.branch_name} · {formatDateTime(invoice.issued_at)}</p></div><strong>{new Intl.NumberFormat('vi-VN').format(Number(invoice.total))} {invoice.currency}</strong><span className={`record-status status-${invoice.status.toLowerCase()}`}>{invoice.status === 'PAID' ? 'Đã thanh toán' : 'Chờ thanh toán'}</span><PatientInvoiceActions status={invoice.status} busy={busyInvoiceId === invoice.id_invoice} onPay={() => void payInvoice(invoice.id_invoice)} /></article>)}</div>}
  </RecordsLayout>
}

export function NotificationsPage() {
  const { isAuthenticated } = useAuth()
  const [notifications, setNotifications] = useState<Notification[] | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(() => apiRequest<NotificationsResponse>('/notifications/', {}, { auth: true }).then((response) => setNotifications(response.data)).catch(() => setError('Không thể tải thông báo.')), [])
  useEffect(() => { if (isAuthenticated) void load() }, [isAuthenticated, load])
  async function markRead(item: Notification) { if (item.read_at) return; await apiRequest(`/notifications/${item.id_notification}/read/`, { method: 'POST' }, { auth: true }); void load() }
  if (!isAuthenticated) return <Navigate to="/dang-nhap?returnTo=%2Fthong-bao" replace />
  return <RecordsLayout title="Thông báo" description="Cập nhật mới nhất về lịch hẹn và hóa đơn." path="/thong-bao">{error ? <RecordState>{error}</RecordState> : notifications === null ? <RecordState>Đang tải thông báo...</RecordState> : notifications.length === 0 ? <RecordState><strong>Bạn chưa có thông báo.</strong></RecordState> : <div className="patient-record-list">{notifications.map((item) => <button type="button" className={`patient-record-card notification-record ${item.read_at ? '' : 'is-unread'}`} key={item.id_notification} onClick={() => markRead(item)}><strong>{item.title}</strong><span>{item.body}</span><small>{formatDateTime(item.created_at)}{item.read_at ? '' : ' · Chưa đọc'}</small></button>)}</div>}</RecordsLayout>
}
