import { useEffect, useState, type FormEvent } from 'react'
import { toDataURL } from 'qrcode'

import type { InvoiceReadyAppointment, ManagedInvoice, ManagedInvoiceDraftInput, ManagedInvoicePayment, ManagedInvoiceStatus, ManagedPayosCheckout, ManagedPaymentInput, ManagedPaymentMethod } from '../../api/management'
import { DataTable, EmptyState, StatusBadge } from '../admin/ui'
import { invoiceStatusLabels } from './invoicePresentation'
import './invoice-management-refresh.css'

const money = (value: string) => `${new Intl.NumberFormat('vi-VN').format(Number(value))} ₫`
const dateTime = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
const paymentMethodLabels: Record<ManagedPaymentMethod, string> = { CASH: 'Tiền mặt', BANK_TRANSFER: 'payOS', CARD: 'Thẻ' }

export function InvoiceAppointmentHint() {
  return <p className="invoice-appointment-hint">
    Chỉ lập hóa đơn cho lượt khám có dịch vụ tính phí. Lượt khám lịch sử dùng giá tại thời điểm đặt lịch và cần được kiểm tra trước khi phát hành.
  </p>
}

export function InvoiceReadyAppointmentQueue({
  appointments,
  loading,
  error,
  count,
  limit,
  offset,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onApplyFilters,
  onClearFilters,
  onPageChange,
  onCreate,
  onRetry,
}: {
  appointments: InvoiceReadyAppointment[]
  loading: boolean
  error: string
  count: number
  limit: number
  offset: number
  dateFrom: string
  dateTo: string
  onDateFromChange: (value: string) => void
  onDateToChange: (value: string) => void
  onApplyFilters: () => void
  onClearFilters: () => void
  onPageChange: (offset: number) => void
  onCreate: (appointment: InvoiceReadyAppointment) => void
  onRetry: () => void
}) {
  return <section className="invoice-ready-queue" aria-labelledby="invoice-ready-title">
    <header>
      <div>
        <p className="eyebrow">Đã khám – chờ lập hóa đơn</p>
        <h2 id="invoice-ready-title">Dịch vụ chờ lập hóa đơn</h2>
        <p>Hóa đơn nháp dùng dịch vụ, số lượng và giá đã ghi nhận trong lượt khám.</p>
      </div>
      <span>Tổng {count} lượt chờ</span>
    </header>
    <form className="invoice-ready-filters" aria-label="Lọc lượt khám chờ lập hóa đơn" onSubmit={(event) => { event.preventDefault(); onApplyFilters() }}>
      <label>Từ ngày<input type="date" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} /></label>
      <label>Đến ngày<input type="date" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} /></label>
      <button type="submit">Lọc</button>
      {(dateFrom || dateTo) && <button type="button" className="button-secondary" onClick={onClearFilters}>Xóa lọc</button>}
    </form>
    {loading ? <p className="invoice-ready-loading">Đang tải lượt khám hoàn tất...</p> : error ? <div className="invoice-ready-empty" role="alert"><p>{error}</p><button type="button" className="button-secondary" onClick={onRetry}>Thử tải lại</button></div> : appointments.length === 0 ? <p className="invoice-ready-empty">Không có lượt khám nào đang chờ lập hóa đơn.</p> : <div className="invoice-ready-list">
      {appointments.map((appointment) => <article key={appointment.appointment_code}>
        <div className="invoice-ready-main">
          <strong>{appointment.patient_name}</strong>
          <span>{appointment.appointment_code} · {dateTime(appointment.completed_at)}</span>
          <small>BS. {appointment.dentist_name}</small>
          <p>{appointment.performed_services.map((service) => `${service.service_name} × ${service.quantity}${service.tooth_reference ? ` · ${service.tooth_reference}` : ''}`).join(' · ')}</p>
          {appointment.billing_basis === 'LEGACY_BOOKING_SNAPSHOT' && <small>Giá từ dịch vụ đã đặt của lượt khám lịch sử; cần kiểm tra trước khi phát hành.</small>}
        </div>
        <div className="invoice-ready-action"><strong>{money(appointment.estimated_total)}</strong><button type="button" onClick={() => onCreate(appointment)}>Lập hóa đơn</button></div>
      </article>)}
    </div>}
    {!loading && !error && <InvoicePagination count={count} limit={limit} offset={offset} onChange={onPageChange} />}
  </section>
}

export function InvoiceTable({ items, onSelect }: { items: ManagedInvoice[]; onSelect: (invoice: ManagedInvoice) => void }) {
  const tone = (status: ManagedInvoiceStatus) => status === 'PAID' ? 'success' as const : status === 'VOID' ? 'danger' as const : status === 'DRAFT' ? 'neutral' as const : 'info' as const
  return <DataTable rows={items} rowKey={(invoice) => invoice.id_invoice} empty={<EmptyState title="Chưa có hóa đơn phù hợp" description="Thử thay đổi bộ lọc hoặc tạo hóa đơn từ lịch khám hoàn tất." />} columns={[
    { key: 'number', header: 'Hóa đơn', cell: (invoice) => <div className="invoice-table-identity"><strong>{invoice.invoice_number}</strong><small>{invoice.appointment_code}</small></div> },
    { key: 'patient', header: 'Bệnh nhân', cell: (invoice) => invoice.patient_name },
    { key: 'created', header: 'Ngày tạo', cell: (invoice) => dateTime(invoice.created_at) },
    { key: 'total', header: 'Tổng tiền', cell: (invoice) => <strong className="invoice-table-total">{money(invoice.total)}</strong> },
    { key: 'status', header: 'Trạng thái', cell: (invoice) => <StatusBadge tone={tone(invoice.status)}>{invoiceStatusLabels[invoice.status]}</StatusBadge> },
    { key: 'action', header: '', cell: (invoice) => <button type="button" className="invoice-table-open" onClick={() => onSelect(invoice)}>Xem chi tiết</button> },
  ]} />
}

export function InvoiceList({ items, onSelect }: { items: ManagedInvoice[]; onSelect: (invoice: ManagedInvoice) => void }) {
  if (!items.length) return <div className="staff-schedule-empty">Chưa có hóa đơn phù hợp.</div>
  return <div className="invoice-management-list">{items.map((invoice) => <article className="invoice-management-card" key={invoice.id_invoice}>
    <div><span className={`invoice-status is-${invoice.status.toLowerCase()}`}>{invoiceStatusLabels[invoice.status]}</span><h3>{invoice.invoice_number}</h3><p>{invoice.patient_name} · {invoice.appointment_code}</p><small>Tạo lúc {dateTime(invoice.created_at)}</small></div>
    <strong>{money(invoice.total)}</strong>
    <button type="button" onClick={() => onSelect(invoice)}>Xem chi tiết</button>
  </article>)}</div>
}

interface InvoiceFiltersProps {
  status: ManagedInvoiceStatus | ''
  appointmentCode: string
  count: number
  onStatusChange: (status: ManagedInvoiceStatus | '') => void
  onAppointmentCodeChange: (value: string) => void
  onSearch: () => void
  onClear: () => void
}

export function InvoiceFilters({ status, appointmentCode, count, onStatusChange, onAppointmentCodeChange, onSearch, onClear }: InvoiceFiltersProps) {
  return <header className="invoice-list-header">
    <div><p className="eyebrow">Danh sách hóa đơn</p><h2>Theo dõi phát hành</h2><span>Tổng {count} hóa đơn</span></div>
    <form aria-label="Lọc hóa đơn" onSubmit={(event) => { event.preventDefault(); onSearch() }}>
      <label>Mã lịch hẹn<input name="appointment-code-filter" value={appointmentCode} onChange={(event) => onAppointmentCodeChange(event.target.value)} placeholder="VD: APT-..." /></label>
      <label>Trạng thái<select name="invoice-status-filter" value={status} onChange={(event) => onStatusChange(event.target.value as ManagedInvoiceStatus | '')}><option value="">Tất cả</option>{Object.entries(invoiceStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button type="submit">Tìm</button>
      {appointmentCode && <button type="button" className="button-secondary" onClick={onClear}>Xóa lọc</button>}
    </form>
  </header>
}

interface InvoicePaginationProps {
  count: number
  limit: number
  offset: number
  onChange: (offset: number) => void
}

export function InvoicePagination({ count, limit, offset, onChange }: InvoicePaginationProps) {
  if (count <= limit) return null
  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.ceil(count / limit)

  return <nav className="invoice-pagination" aria-label="Phân trang hóa đơn">
    <button
      type="button"
      disabled={offset === 0}
      onClick={() => onChange(Math.max(0, offset - limit))}
    >
      Trang trước
    </button>
    <span>Trang {currentPage} / {totalPages}</span>
    <button
      type="button"
      disabled={offset + limit >= count}
      onClick={() => onChange(offset + limit)}
    >
      Trang sau
    </button>
  </nav>
}

interface InvoiceDetailPanelProps { invoice: ManagedInvoice; busy: boolean; onClose: () => void; onIssue: () => void; onVoid: () => void; onEdit: () => void; onRecordPayment: () => void; onVoidPayment: (payment: ManagedInvoicePayment) => void }
export function InvoiceDetailPanel({ invoice, busy, onClose, onIssue, onVoid, onEdit, onRecordPayment, onVoidPayment }: InvoiceDetailPanelProps) {
  const postedPayment = invoice.payments.find((payment) => payment.status === 'POSTED')
  return <div className="branch-management-modal-backdrop"><section className="branch-management-modal invoice-detail-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-detail-title">
    <header><div><span className={`invoice-status is-${invoice.status.toLowerCase()}`}>{invoiceStatusLabels[invoice.status]}</span><h2 id="invoice-detail-title">{invoice.invoice_number}</h2><p>{invoice.patient_name} · Lịch {invoice.appointment_code}</p></div><button type="button" className="invoice-close" onClick={onClose} aria-label="Đóng">×</button></header>
    <div className="invoice-line-list">{invoice.lines.map((line) => <div key={line.id_invoice_line}><span><strong>{line.description}</strong><small>{line.quantity} × {money(line.unit_price)}</small></span><b>{money(line.line_total)}</b></div>)}</div>
    <dl className="invoice-totals"><div><dt>Tạm tính</dt><dd>{money(invoice.subtotal)}</dd></div><div><dt>Giảm giá</dt><dd>- {money(invoice.discount)}</dd></div><div><dt>Tổng cộng</dt><dd>{money(invoice.total)}</dd></div></dl>
    <section className="invoice-payments" aria-labelledby="invoice-payments-title">
      <h3 id="invoice-payments-title">Thanh toán</h3>
      {invoice.payments.length === 0 ? <p>Chưa ghi nhận thanh toán.</p> : <div>{invoice.payments.map((payment) => <article key={payment.id_payment}>
        <header><strong>{paymentMethodLabels[payment.method]}</strong><span className={`payment-status is-${payment.status.toLowerCase()}`}>{payment.status === 'POSTED' ? 'Đã ghi nhận' : 'Đã hủy'}</span></header>
        <dl><div><dt>Mã thanh toán</dt><dd>{payment.payment_number}</dd></div><div><dt>Số tiền</dt><dd>{money(payment.amount)}</dd></div><div><dt>Thời điểm</dt><dd>{dateTime(payment.posted_at)}</dd></div>{payment.external_reference && <div><dt>Mã tham chiếu</dt><dd>{payment.external_reference}</dd></div>}</dl>
        {payment.void_reason && <p><strong>Lý do hủy:</strong> {payment.void_reason}</p>}
      </article>)}</div>}
    </section>
    {invoice.void_reason && <p className="invoice-void-reason"><strong>Lý do hủy:</strong> {invoice.void_reason}</p>}
    <footer>
      <button type="button" className="button-secondary" onClick={onClose}>Quay lại</button>
      {invoice.status === 'DRAFT' && <button type="button" className="button-secondary" disabled={busy} onClick={onEdit}>Chỉnh sửa</button>}
      {invoice.status === 'DRAFT' && <button type="button" disabled={busy} onClick={onIssue}>Phát hành hóa đơn</button>}
      {['DRAFT', 'ISSUED'].includes(invoice.status) && <button type="button" className="button-danger" disabled={busy} onClick={onVoid}>Hủy hóa đơn</button>}
      {invoice.status === 'ISSUED' && <button type="button" disabled={busy} onClick={onRecordPayment}>Thanh toán</button>}
      {invoice.status === 'PAID' && postedPayment?.source === 'PAYOS' && <p className="payment-refund-warning">Thanh toán payOS không thể hủy tại đây. Cần hoàn tiền thực tế cho khách theo quy trình riêng.</p>}
      {invoice.status === 'PAID' && postedPayment?.source !== 'PAYOS' && postedPayment && <button type="button" className="button-danger" disabled={busy} onClick={() => onVoidPayment(postedPayment)}>Hủy thanh toán</button>}
    </footer>
  </section></div>
}

type EditableInvoiceLine = {
  key: string
  service: number | null
  description: string
  quantity: string
  unitPrice: string
}

interface InvoiceDraftEditorProps {
  invoice: ManagedInvoice
  busy: boolean
  serverError?: string
  onCancel: () => void
  onSubmit: (data: ManagedInvoiceDraftInput) => void
}

export function InvoiceDraftEditor({ invoice, busy, serverError = '', onCancel, onSubmit }: InvoiceDraftEditorProps) {
  const [discount, setDiscount] = useState(invoice.discount)
  const [lines, setLines] = useState<EditableInvoiceLine[]>(invoice.lines.map((line) => ({
    key: `existing-${line.id_invoice_line}`,
    service: line.service_id,
    description: line.description,
    quantity: String(line.quantity),
    unitPrice: line.unit_price,
  })))
  const [validationError, setValidationError] = useState('')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const subtotal = lines.reduce((sum, line) => {
    const quantity = Number(line.quantity)
    const unitPrice = Number(line.unitPrice)
    return sum + (Number.isFinite(quantity) && Number.isFinite(unitPrice) ? quantity * unitPrice : 0)
  }, 0)
  const discountValue = Number(discount)
  const estimatedTotal = Math.max(0, subtotal - (Number.isFinite(discountValue) ? discountValue : 0))

  function updateLine(key: string, patch: Partial<EditableInvoiceLine>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line))
  }

  function addLine() {
    setLines((current) => [...current, {
      key: crypto.randomUUID(),
      service: null,
      description: '',
      quantity: '1',
      unitPrice: '0',
    }])
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const invalidQuantity = lines.some((line) => !Number.isInteger(Number(line.quantity)) || Number(line.quantity) < 1)
    const invalidPrice = lines.some((line) => !Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 0)
    const invalidDescription = lines.some((line) => !line.description.trim())
    const reason = adjustmentReason.trim()
    if (invalidQuantity) setValidationError('Số lượng của mỗi dòng phải là số nguyên từ 1 trở lên.')
    else if (invalidPrice) setValidationError('Đơn giá của mỗi dòng phải từ 0 trở lên.')
    else if (invalidDescription) setValidationError('Mỗi dòng hóa đơn cần có mô tả.')
    else if (!Number.isFinite(discountValue) || discountValue < 0 || discountValue > subtotal) setValidationError('Giảm giá phải từ 0 đến tạm tính.')
    else if (reason.length < 3) setValidationError('Cần ghi rõ lý do điều chỉnh hóa đơn, tối thiểu 3 ký tự.')
    else {
      setValidationError('')
      onSubmit({
        discount,
        lines: lines.map((line) => ({
          service: line.service,
          description: line.description.trim(),
          quantity: Number(line.quantity),
          unit_price: line.unitPrice,
        })),
        adjustment_reason: reason,
      })
    }
  }

  return <div className="branch-management-modal-backdrop invoice-confirm-layer"><form className="branch-management-modal invoice-draft-editor" role="dialog" aria-modal="true" aria-label="Chỉnh sửa hóa đơn nháp" onSubmit={submit}>
    <header><div><p className="eyebrow">Hóa đơn nháp</p><h2>Chỉnh sửa {invoice.invoice_number}</h2></div><button type="button" className="invoice-close" disabled={busy} onClick={onCancel} aria-label="Đóng">×</button></header>
    {(validationError || serverError) && <div className="payment-modal-error" role="alert">{validationError || serverError}</div>}
    <div className="invoice-draft-lines">
      {lines.map((line, index) => <article key={line.key}>
        <header><strong>Dòng {index + 1}</strong><button type="button" aria-label="Xóa dòng hóa đơn" disabled={busy} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>Xóa</button></header>
        <label>Mô tả<input name="line-description" value={line.description} maxLength={255} disabled={busy} onChange={(event) => updateLine(line.key, { description: event.target.value })} /></label>
        <div><label>Số lượng<input name="line-quantity" type="number" min="1" step="1" value={line.quantity} disabled={busy} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} /></label><label>Đơn giá<input name="line-unit-price" type="number" min="0" step="1" value={line.unitPrice} disabled={busy} onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })} /></label></div>
      </article>)}
      <button type="button" className="invoice-add-line" aria-label="Thêm dòng hóa đơn" disabled={busy} onClick={addLine}>+ Thêm dòng</button>
    </div>
    <label>Giảm giá<input name="invoice-discount" type="number" min="0" step="1" value={discount} disabled={busy} onChange={(event) => setDiscount(event.target.value)} /></label>
    <label>Lý do điều chỉnh<textarea name="invoice-adjustment-reason" required minLength={3} maxLength={1000} value={adjustmentReason} disabled={busy} onChange={(event) => setAdjustmentReason(event.target.value)} placeholder="Ví dụ: Điều chỉnh theo dịch vụ phát sinh đã được bệnh nhân đồng ý." /></label>
    <dl className="invoice-draft-preview"><div><dt>Tạm tính dự kiến</dt><dd>{money(String(subtotal))}</dd></div><div><dt>Tổng dự kiến</dt><dd>{money(String(estimatedTotal))}</dd></div></dl>
    <p className="invoice-draft-note">Số tiền chính thức được lấy từ hệ thống sau khi lưu.</p>
    <div><button type="button" className="button-secondary" disabled={busy} onClick={onCancel}>Quay lại</button><button type="submit" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu thay đổi'}</button></div>
  </form></div>
}

interface PaymentModalProps {
  invoice: ManagedInvoice
  idempotencyKey: string
  busy: boolean
  serverError?: string
  onCancel: () => void
  onSubmit: (data: ManagedPaymentInput) => void
}

export function PaymentChoiceModal({ busy, onCancel, onCash, onPayos }: {
  busy: boolean
  onCancel: () => void
  onCash: () => void
  onPayos: () => void
}) {
  return <div className="branch-management-modal-backdrop invoice-confirm-layer"><section className="branch-management-modal payment-modal" role="dialog" aria-modal="true" aria-label="Chọn phương thức thanh toán">
    <h2>Thanh toán hóa đơn</h2>
    <p>Chọn cách thanh toán tại quầy. QR payOS chỉ được xác nhận khi payOS gửi kết quả về hệ thống.</p>
    <div className="payment-choice-actions">
      <button type="button" disabled={busy} onClick={onCash}><strong>Tiền mặt</strong><span>Thu tiền trực tiếp tại quầy</span></button>
      <button type="button" className="button-secondary" disabled={busy} onClick={onPayos}><strong>QR payOS</strong><span>Tạo mã để khách quét và thanh toán</span></button>
    </div>
    <div><button type="button" className="button-secondary" disabled={busy} onClick={onCancel}>Quay lại</button></div>
  </section></div>
}

export function PayosCheckoutModal({ checkout, busy, serverError = '', onCancel, onRetry }: {
  checkout: ManagedPayosCheckout | null
  busy: boolean
  serverError?: string
  onCancel: () => void
  onRetry: () => void
}) {
  const [qrImage, setQrImage] = useState('')

  useEffect(() => {
    let active = true
    if (!checkout?.qr_code) {
      setQrImage('')
      return () => { active = false }
    }
    void toDataURL(checkout.qr_code, { width: 280, margin: 1 }).then((value) => {
      if (active) setQrImage(value)
    }).catch(() => {
      if (active) setQrImage('')
    })
    return () => { active = false }
  }, [checkout?.order_code, checkout?.qr_code])

  return <div className="branch-management-modal-backdrop invoice-confirm-layer"><section className="branch-management-modal payment-modal payos-checkout-modal" role="dialog" aria-modal="true" aria-label="Thanh toán QR payOS">
    <h2>Thanh toán QR payOS</h2>
    {serverError && <div className="payment-modal-error" role="alert">{serverError}</div>}
    {!checkout && <><p>Tạo mã QR để khách quét bằng ứng dụng ngân hàng.</p><div><button type="button" className="button-secondary" disabled={busy} onClick={onCancel}>Quay lại</button><button type="button" disabled={busy} onClick={onRetry}>{busy ? 'Đang tạo...' : 'Tạo mã QR'}</button></div></>}
    {checkout && <>
      {qrImage ? <img className="payos-qr-image" src={qrImage} alt="Mã QR payOS để thanh toán" /> : <p>Không thể hiển thị mã QR. Hãy mở liên kết payOS bên dưới.</p>}
      <p className="payment-method-note"><strong>Đang chờ payOS xác minh</strong><span>Không thu tiền mặt cho hóa đơn này khi mã QR còn hiệu lực.</span></p>
      <a className="button-secondary payos-checkout-link" href={checkout.checkout_url} target="_blank" rel="noreferrer">Mở trang payOS</a>
      <div><button type="button" className="button-secondary" onClick={onCancel}>Đóng</button><button type="button" disabled={busy} onClick={onRetry}>{busy ? 'Đang kiểm tra...' : 'Làm mới trạng thái'}</button></div>
    </>}
  </section></div>
}

export function PaymentModal({ invoice, idempotencyKey, busy, serverError = '', onCancel, onSubmit }: PaymentModalProps) {
  const [cashReceived, setCashReceived] = useState(invoice.total)
  const [validationError, setValidationError] = useState('')
  const invoiceTotal = Number(invoice.total)
  const received = Number(cashReceived)
  const change = Number.isFinite(received) ? Math.max(0, received - invoiceTotal) : 0

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!Number.isFinite(received) || received < invoiceTotal) {
      setValidationError('Số tiền khách đưa phải đủ tổng hóa đơn.')
      return
    }
    setValidationError('')
    onSubmit({ method: 'CASH', amount: invoice.total, external_reference: '', idempotency_key: idempotencyKey })
  }

  return <div className="branch-management-modal-backdrop invoice-confirm-layer"><form className="branch-management-modal payment-modal" role="dialog" aria-modal="true" aria-label="Ghi nhận thanh toán" onSubmit={submit}>
    <h2>Ghi nhận thanh toán</h2>
    <p>Hóa đơn {invoice.invoice_number}</p>
    {(validationError || serverError) && <div className="payment-modal-error" role="alert">{validationError || serverError}</div>}
    <p className="payment-method-note"><strong>Tiền mặt tại quầy</strong><span>Thanh toán payOS được xác minh tự động từ giao dịch online.</span></p>
    <label>Tổng cần thu<input value={invoice.total} readOnly aria-readonly="true" /></label>
    <label>Khách đưa<input name="cash-received" type="number" min={invoice.total} step="1" inputMode="numeric" value={cashReceived} disabled={busy} onChange={(event) => { setCashReceived(event.target.value); setValidationError('') }} /></label>
    <output className="payment-change" aria-live="polite"><span>Tiền thừa</span><strong>{money(String(change))}</strong></output>
    <div><button type="button" className="button-secondary" disabled={busy} onClick={onCancel}>Quay lại</button><button type="submit" disabled={busy}>{busy ? 'Đang ghi nhận...' : 'Xác nhận đã thu tiền'}</button></div>
  </form></div>
}

interface VoidPaymentModalProps {
  payment: ManagedInvoicePayment
  busy: boolean
  serverError?: string
  onCancel: () => void
  onSubmit: (reason: string) => void
}

export function VoidPaymentModal({ payment, busy, serverError = '', onCancel, onSubmit }: VoidPaymentModalProps) {
  const [reason, setReason] = useState('')
  const [validationError, setValidationError] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    const value = reason.trim()
    if (value.length < 3) {
      setValidationError('Cần nhập lý do hủy thanh toán, tối thiểu 3 ký tự.')
      return
    }
    setValidationError('')
    onSubmit(value)
  }

  return <div className="branch-management-modal-backdrop invoice-confirm-layer"><form className="branch-management-modal payment-modal" role="dialog" aria-modal="true" aria-label="Hủy thanh toán" onSubmit={submit}>
    <h2>Hủy thanh toán</h2>
    <p>Thanh toán {payment.payment_number} · {money(payment.amount)}</p>
    <div className="payment-refund-warning">Hệ thống chỉ đưa hóa đơn về chưa thanh toán. Việc hoàn tiền thật cho khách phải làm riêng.</div>
    {(validationError || serverError) && <div className="payment-modal-error" role="alert">{validationError || serverError}</div>}
    <label>Lý do<textarea value={reason} disabled={busy} minLength={3} maxLength={1000} onChange={(event) => setReason(event.target.value)} /></label>
    <div><button type="button" className="button-secondary" disabled={busy} onClick={onCancel}>Quay lại</button><button type="submit" disabled={busy}>{busy ? 'Đang hủy...' : 'Xác nhận hủy thanh toán'}</button></div>
  </form></div>
}
