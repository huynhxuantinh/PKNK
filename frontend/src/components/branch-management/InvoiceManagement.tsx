import { useState, type FormEvent } from 'react'

import type { ManagedInvoice, ManagedInvoiceDraftInput, ManagedInvoicePayment, ManagedInvoiceStatus, ManagedPaymentInput, ManagedPaymentMethod } from '../../api/management'
import { invoiceStatusLabels } from './invoicePresentation'

const money = (value: string) => `${new Intl.NumberFormat('vi-VN').format(Number(value))} ₫`
const dateTime = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
const paymentMethodLabels: Record<ManagedPaymentMethod, string> = { CASH: 'Tiền mặt', BANK_TRANSFER: 'Chuyển khoản', CARD: 'Thẻ' }

export function InvoiceAppointmentHint() {
  return <p className="invoice-appointment-hint">
    Danh sách chỉ gợi ý lịch đã hoàn tất trong 30 ngày gần nhất. Với lịch cũ hơn,
    hãy nhập trực tiếp mã lịch hẹn.
  </p>
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
      {invoice.status === 'ISSUED' && <button type="button" disabled={busy} onClick={onRecordPayment}>Ghi nhận thanh toán</button>}
      {invoice.status === 'PAID' && postedPayment && <button type="button" className="button-danger" disabled={busy} onClick={() => onVoidPayment(postedPayment)}>Hủy thanh toán</button>}
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
    if (invalidQuantity) setValidationError('Số lượng của mỗi dòng phải là số nguyên từ 1 trở lên.')
    else if (invalidPrice) setValidationError('Đơn giá của mỗi dòng phải từ 0 trở lên.')
    else if (invalidDescription) setValidationError('Mỗi dòng hóa đơn cần có mô tả.')
    else if (!Number.isFinite(discountValue) || discountValue < 0 || discountValue > subtotal) setValidationError('Giảm giá phải từ 0 đến tạm tính.')
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

export function PaymentModal({ invoice, idempotencyKey, busy, serverError = '', onCancel, onSubmit }: PaymentModalProps) {
  const [method, setMethod] = useState<ManagedPaymentMethod>('CASH')
  const [externalReference, setExternalReference] = useState('')
  const [validationError, setValidationError] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    const reference = externalReference.trim()
    if (method !== 'CASH' && !reference) {
      setValidationError('Cần nhập mã giao dịch cho chuyển khoản hoặc thanh toán thẻ.')
      return
    }
    setValidationError('')
    onSubmit({ method, amount: invoice.total, external_reference: reference, idempotency_key: idempotencyKey })
  }

  return <div className="branch-management-modal-backdrop invoice-confirm-layer"><form className="branch-management-modal payment-modal" role="dialog" aria-modal="true" aria-label="Ghi nhận thanh toán" onSubmit={submit}>
    <h2>Ghi nhận thanh toán</h2>
    <p>Hóa đơn {invoice.invoice_number}</p>
    {(validationError || serverError) && <div className="payment-modal-error" role="alert">{validationError || serverError}</div>}
    <label>Phương thức<select name="payment-method" value={method} disabled={busy} onChange={(event) => { setMethod(event.target.value as ManagedPaymentMethod); setValidationError('') }}><option value="CASH">Tiền mặt</option><option value="BANK_TRANSFER">Chuyển khoản</option><option value="CARD">Thẻ</option></select></label>
    <label>Số tiền<input value={invoice.total} readOnly aria-readonly="true" /></label>
    <label>Mã tham chiếu<input value={externalReference} disabled={busy} maxLength={100} onChange={(event) => setExternalReference(event.target.value)} placeholder={method === 'CASH' ? 'Không bắt buộc' : 'Nhập số giao dịch'} /></label>
    <div><button type="button" className="button-secondary" disabled={busy} onClick={onCancel}>Quay lại</button><button type="submit" disabled={busy}>{busy ? 'Đang ghi nhận...' : 'Xác nhận thanh toán'}</button></div>
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
