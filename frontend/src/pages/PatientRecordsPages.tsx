import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { apiRequest } from '../api/client'
import { AuthBar } from '../auth/AuthBar'
import { useAuth } from '../auth/AuthContext'
import { Seo } from '../seo/Seo'
import type {
  PatientAppointment,
  PatientAppointmentsResponse,
  PatientClinicalEncounter,
  PatientClinicalEncountersResponse,
  PatientAppointmentStatus,
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
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [cancellingCode, setCancellingCode] = useState('')

  useEffect(() => {
    if (!isAuthenticated) return
    apiRequest<PatientAppointmentsResponse>(
      '/patients/me/appointments/?scope=UPCOMING&page_size=100',
      {},
      { auth: true },
    )
      .then((response) => {
        const now = Date.now()
        // Keep the list correct if a legacy API response contains a stale active appointment.
        setAppointments(response.data.filter((appointment) => new Date(appointment.starts_at).getTime() >= now))
      })
      .catch(() => setError('Không thể tải lịch đã đặt. Vui lòng thử lại.'))
  }, [isAuthenticated])

  async function cancelAppointment(appointment: PatientAppointment) {
    if (!window.confirm(`Bạn có chắc muốn hủy lịch ${formatDateTime(appointment.starts_at)}?`)) return
    setCancellingCode(appointment.public_code)
    setError('')
    setNotice('')
    try {
      await apiRequest<{ data: PatientAppointment }>(
        `/patients/me/appointments/${appointment.public_code}/cancel/`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'Người bệnh chủ động hủy lịch.' }),
        },
        { auth: true },
      )
      setAppointments((current) => current?.filter((item) => item.public_code !== appointment.public_code) || [])
      setNotice('Đã hủy lịch khám.')
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
      description="Theo dõi các lịch khám sắp tới của bạn."
      path="/lich-hen"
    >
      {notice && <p className="patient-record-notice" role="status">{notice}</p>}
      {error ? <RecordState>{error}</RecordState> : appointments === null ? (
        <RecordState>Đang tải lịch hẹn...</RecordState>
      ) : appointments.length === 0 ? (
        <RecordState>
          <strong>Bạn chưa có lịch khám sắp tới.</strong>
          <Link className="button button-primary" to="/dat-lich">Đặt lịch khám</Link>
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
                    <button type="button" disabled={cancellingCode === appointment.public_code} onClick={() => cancelAppointment(appointment)}>
                      {cancellingCode === appointment.public_code ? 'Đang hủy...' : 'Hủy lịch'}
                    </button>
                  </div>
                )}
              </div>
            </article>
            ))}
          </div>
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
              {encounter.notes && (
                <details className="record-notes">
                  <summary>Xem ghi chú khám</summary>
                  <p>{encounter.notes}</p>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
    </RecordsLayout>
  )
}
