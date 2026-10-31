import type { ManagementAppointment } from '../../api/management'
import { appointmentStatusLabels, hcmDate, hcmTime } from './appointmentPresentation'

type AppointmentAction = 'confirm' | 'check-in' | 'no-show'

interface AppointmentListProps {
  items: ManagementAppointment[] | null
  busyCode: string
  onAction: (item: ManagementAppointment, action: AppointmentAction) => void
  onCancel: (item: ManagementAppointment) => void
  onReschedule: (item: ManagementAppointment) => void
}

export function ManagementErrorBanner({ message }: { message: string }) {
  return (
    <div className="dentist-error" role="alert">
      {message}
    </div>
  )
}

export function AppointmentList({
  items,
  busyCode,
  onAction,
  onCancel,
  onReschedule,
}: AppointmentListProps) {
  if (!items) return <div className="dentist-empty">Đang tải lịch hẹn...</div>
  if (items.length === 0) return <div className="dentist-empty">Không có lịch hẹn.</div>

  return (
    <div className="branch-management-list">
      {items.map((item) => {
        const isBusy = busyCode === item.public_code
        const bookingContactName = item.contact_name_snapshot || item.patient_name
        const bookingContactPhone = item.contact_phone_snapshot || item.patient_phone

        return (
          <article key={item.public_code} className="branch-management-appointment">
            <time>
              <strong>{hcmTime(item.starts_at)}</strong>
              <span>{hcmDate(new Date(item.starts_at))}</span>
            </time>

            <div>
              <span className={`dentist-status is-${item.status.toLowerCase()}`}>
                {appointmentStatusLabels[item.status]}
              </span>
              <h3>{item.patient_name}</h3>
              <p>{item.service_name_snapshot} · {item.dentist_name}</p>
              <div className="branch-management-contact-details">
                <small><strong>Hồ sơ bệnh nhân:</strong> {item.patient_phone || 'Chưa có số điện thoại'}</small>
                <small>
                  <strong>Liên hệ đặt lịch:</strong> {bookingContactName} · {bookingContactPhone || 'Chưa có số điện thoại'}
                  {item.contact_email_snapshot ? ` · ${item.contact_email_snapshot}` : ''}
                </small>
                {item.patient_note && <small><strong>Ghi chú:</strong> {item.patient_note}</small>}
                {item.cancel_reason && <small><strong>Lý do hủy:</strong> {item.cancel_reason}</small>}
              </div>
            </div>

            <div className="branch-management-actions">
              {item.status === 'PENDING' && (
                <button onClick={() => onAction(item, 'confirm')} disabled={isBusy}>
                  Xác nhận
                </button>
              )}
              {item.status === 'CONFIRMED' && (
                <button onClick={() => onAction(item, 'check-in')} disabled={isBusy}>
                  Check-in
                </button>
              )}
              {['PENDING', 'CONFIRMED'].includes(item.status) && (
                <button className="button-quiet" onClick={() => onReschedule(item)}>
                  Đổi lịch
                </button>
              )}
              {['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(item.status) && (
                <button className="button-secondary" onClick={() => onCancel(item)}>
                  Hủy lịch
                </button>
              )}
              {item.status === 'CONFIRMED' && (
                <button className="button-quiet" onClick={() => onAction(item, 'no-show')} disabled={isBusy}>
                  Không đến
                </button>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}
