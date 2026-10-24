import type { ManagedInvoice } from '../../api/management'
import { invoiceStatusLabels } from './invoicePresentation'

const money = (value: string) => `${new Intl.NumberFormat('vi-VN').format(Number(value))} ₫`
const dateTime = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
export function InvoiceList({ items, onSelect }: { items: ManagedInvoice[]; onSelect: (invoice: ManagedInvoice) => void }) {
  if (!items.length) return <div className="staff-schedule-empty">Chưa có hóa đơn phù hợp.</div>
  return <div className="invoice-management-list">{items.map((invoice) => <article className="invoice-management-card" key={invoice.id_invoice}>
    <div><span className={`invoice-status is-${invoice.status.toLowerCase()}`}>{invoiceStatusLabels[invoice.status]}</span><h3>{invoice.invoice_number}</h3><p>{invoice.patient_name} · {invoice.appointment_code}</p><small>Tạo lúc {dateTime(invoice.created_at)}</small></div>
    <strong>{money(invoice.total)}</strong>
    <button type="button" onClick={() => onSelect(invoice)}>Xem chi tiết</button>
  </article>)}</div>
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

interface InvoiceDetailPanelProps { invoice: ManagedInvoice; busy: boolean; onClose: () => void; onIssue: () => void; onVoid: () => void }
export function InvoiceDetailPanel({ invoice, busy, onClose, onIssue, onVoid }: InvoiceDetailPanelProps) {
  return <div className="branch-management-modal-backdrop"><section className="branch-management-modal invoice-detail-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-detail-title">
    <header><div><span className={`invoice-status is-${invoice.status.toLowerCase()}`}>{invoiceStatusLabels[invoice.status]}</span><h2 id="invoice-detail-title">{invoice.invoice_number}</h2><p>{invoice.patient_name} · Lịch {invoice.appointment_code}</p></div><button type="button" className="invoice-close" onClick={onClose} aria-label="Đóng">×</button></header>
    <div className="invoice-line-list">{invoice.lines.map((line) => <div key={line.id_invoice_line}><span><strong>{line.description}</strong><small>{line.quantity} × {money(line.unit_price)}</small></span><b>{money(line.line_total)}</b></div>)}</div>
    <dl className="invoice-totals"><div><dt>Tạm tính</dt><dd>{money(invoice.subtotal)}</dd></div><div><dt>Giảm giá</dt><dd>- {money(invoice.discount)}</dd></div><div><dt>Tổng cộng</dt><dd>{money(invoice.total)}</dd></div></dl>
    {invoice.void_reason && <p className="invoice-void-reason"><strong>Lý do hủy:</strong> {invoice.void_reason}</p>}
    <footer>
      <button type="button" className="button-secondary" onClick={onClose}>Quay lại</button>
      {invoice.status === 'DRAFT' && <button type="button" disabled={busy} onClick={onIssue}>Phát hành hóa đơn</button>}
      {['DRAFT', 'ISSUED'].includes(invoice.status) && <button type="button" className="button-danger" disabled={busy} onClick={onVoid}>Hủy hóa đơn</button>}
      {['DRAFT', 'ISSUED'].includes(invoice.status) && <button type="button" disabled title="Sắp hỗ trợ">Ghi nhận thanh toán</button>}
    </footer>
  </section></div>
}
