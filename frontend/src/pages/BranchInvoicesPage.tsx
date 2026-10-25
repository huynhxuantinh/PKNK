import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'

import { listBranchAppointments } from '../api/management'
import {
  createManagedInvoice, getManagedInvoice, issueManagedInvoice, listManagedInvoices,
  postManagedPayment, voidManagedInvoice, voidManagedPayment,
  updateManagedInvoiceDraft, type ManagedInvoice, type ManagedInvoiceDraftInput,
  type ManagedInvoicePayment, type ManagedInvoiceStatus, type ManagedPaymentInput,
} from '../api/management'
import { useAuth } from '../auth/AuthContext'
import { canAccessArea } from '../auth/roles'
import {
  InvoiceAppointmentHint,
  InvoiceDraftEditor,
  InvoiceDetailPanel,
  InvoiceFilters,
  InvoiceList,
  InvoicePagination,
  PaymentModal,
  VoidPaymentModal,
} from '../components/branch-management/InvoiceManagement'
import { ManagementPageHeader } from '../components/branch-management/ManagementPageHeader'
import { ManagementSectionNav } from '../components/branch-management/ManagementSectionNav'
import { hcmDate } from '../components/branch-management/appointmentPresentation'
import {
  latestVoidedInvoiceId,
} from '../components/branch-management/invoicePresentation'

const INVOICE_PAGE_SIZE = 20

export function BranchInvoicesPage() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const branchId = Number(params.get('chi-nhanh')) || 0
  const [status, setStatus] = useState<ManagedInvoiceStatus | ''>('')
  const [appointmentFilterInput, setAppointmentFilterInput] = useState('')
  const [appliedAppointmentFilter, setAppliedAppointmentFilter] = useState('')
  const [items, setItems] = useState<ManagedInvoice[]>([])
  const [invoiceCount, setInvoiceCount] = useState(0)
  const [offset, setOffset] = useState(0)
  const [completedAppointments, setCompletedAppointments] = useState<Array<{ public_code: string; patient_name: string; service_name_snapshot: string }>>([])
  const [selected, setSelected] = useState<ManagedInvoice | null>(null)
  const [appointmentCode, setAppointmentCode] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showVoid, setShowVoid] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [showDraftEditor, setShowDraftEditor] = useState(false)
  const [paymentAttemptKey, setPaymentAttemptKey] = useState('')
  const [paymentToVoid, setPaymentToVoid] = useState<ManagedInvoicePayment | null>(null)
  const [paymentError, setPaymentError] = useState('')
  const [draftEditorError, setDraftEditorError] = useState('')
  const [voidReason, setVoidReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadInvoices = useCallback(async () => {
    if (!branchId) return
    setLoading(true)
    setItems([])
    try {
      const response = await listManagedInvoices(branchId, {
        status: status || undefined,
        appointmentCode: appliedAppointmentFilter || undefined,
        limit: INVOICE_PAGE_SIZE,
        offset,
      })
      if (offset > 0 && response.data.length === 0) {
        setOffset(Math.max(0, offset - INVOICE_PAGE_SIZE))
        return
      }
      setItems(response.data)
      setInvoiceCount(response.meta.count)
      setError('')
    } catch (caught) {
      setInvoiceCount(0)
      setError(caught instanceof Error ? caught.message : 'Không thể tải hóa đơn.')
    }
    finally { setLoading(false) }
  }, [appliedAppointmentFilter, branchId, offset, status])

  useEffect(() => { void loadInvoices() }, [loadInvoices])
  useEffect(() => { setOffset(0) }, [branchId])
  useEffect(() => {
    if (!branchId) return
    const from = hcmDate(new Date(Date.now() - 30 * 86400000))
    listBranchAppointments(branchId, from, 'COMPLETED', undefined, 31)
      .then((response) => setCompletedAppointments(response.data))
      .catch(() => setCompletedAppointments([]))
  }, [branchId])

  async function selectInvoice(invoice: ManagedInvoice) {
    setError('')
    try { const response = await getManagedInvoice(invoice.id_invoice); setSelected(response.data) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải chi tiết hóa đơn.') }
  }

  function searchInvoices() {
    setOffset(0)
    setAppliedAppointmentFilter(appointmentFilterInput.trim())
  }

  function clearAppointmentFilter() {
    setOffset(0)
    setAppointmentFilterInput('')
    setAppliedAppointmentFilter('')
  }

  async function createInvoice(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    const code = appointmentCode.trim()
    try {
      const existing = await listManagedInvoices(branchId, {
        appointmentCode: code,
        limit: 100,
      })
      if (existing.data.some((invoice) => invoice.status !== 'VOID')) {
        throw new Error('Lịch hẹn này đã có hóa đơn đang hoạt động.')
      }
      const replacementId = latestVoidedInvoiceId(existing.data)
      const response = await createManagedInvoice(branchId, code, replacementId)
      setShowCreate(false); setAppointmentCode(''); setSelected(response.data); setNotice('Đã tạo hóa đơn nháp.'); await loadInvoices()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tạo hóa đơn.') }
    finally { setBusy(false) }
  }

  async function issueInvoice() {
    if (!selected) return
    setBusy(true); setError(''); setNotice('')
    try { const response = await issueManagedInvoice(selected.id_invoice); setSelected(response.data); setNotice('Đã phát hành hóa đơn.'); await loadInvoices() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể phát hành hóa đơn.') }
    finally { setBusy(false) }
  }

  async function voidInvoice(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    setBusy(true); setError(''); setNotice('')
    try { const response = await voidManagedInvoice(selected.id_invoice, voidReason.trim()); setSelected(response.data); setShowVoid(false); setVoidReason(''); setNotice('Đã hủy hóa đơn.'); await loadInvoices() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể hủy hóa đơn.') }
    finally { setBusy(false) }
  }

  function openPayment() {
    setPaymentError('')
    setPaymentAttemptKey(crypto.randomUUID())
    setShowPayment(true)
  }

  async function recordPayment(data: ManagedPaymentInput) {
    if (!selected) return
    setBusy(true); setPaymentError(''); setNotice('')
    try {
      await postManagedPayment(selected.id_invoice, data)
      const refreshed = await getManagedInvoice(selected.id_invoice)
      setSelected(refreshed.data); setShowPayment(false); setPaymentAttemptKey(''); setNotice('Đã ghi nhận thanh toán.'); await loadInvoices()
    } catch (caught) { setPaymentError(caught instanceof Error ? caught.message : 'Không thể ghi nhận thanh toán.') }
    finally { setBusy(false) }
  }

  function openVoidPayment(payment: ManagedInvoicePayment) {
    setPaymentError('')
    setPaymentToVoid(payment)
  }

  async function voidPayment(reason: string) {
    if (!selected || !paymentToVoid) return
    setBusy(true); setPaymentError(''); setNotice('')
    try {
      await voidManagedPayment(paymentToVoid.id_payment, reason)
      const refreshed = await getManagedInvoice(selected.id_invoice)
      setSelected(refreshed.data); setPaymentToVoid(null); setNotice('Đã hủy thanh toán.'); await loadInvoices()
    } catch (caught) { setPaymentError(caught instanceof Error ? caught.message : 'Không thể hủy thanh toán.') }
    finally { setBusy(false) }
  }

  function openDraftEditor() {
    setDraftEditorError('')
    setShowDraftEditor(true)
  }

  async function updateDraft(data: ManagedInvoiceDraftInput) {
    if (!selected) return
    setBusy(true); setDraftEditorError(''); setNotice('')
    try {
      const response = await updateManagedInvoiceDraft(selected.id_invoice, data)
      setSelected(response.data); setShowDraftEditor(false); setNotice('Đã cập nhật hóa đơn nháp.'); await loadInvoices()
    } catch (caught) { setDraftEditorError(caught instanceof Error ? caught.message : 'Không thể cập nhật hóa đơn nháp.') }
    finally { setBusy(false) }
  }

  if (!canAccessArea(user, 'MANAGEMENT') || !branchId) return <Navigate to="/quan-ly-chi-nhanh" replace />
  return <div className="branch-management-page invoice-management-page">
    <ManagementPageHeader title="Hóa đơn chi nhánh" path="/quan-ly-chi-nhanh/hoa-don" />
    <main><div className="branch-management-main">
    <Link className="staff-schedule-back" to={`/quan-ly-chi-nhanh?chi-nhanh=${branchId}`}>← Quay lại quản lý chi nhánh</Link>
    <header className="invoice-management-heading"><div><span>Thu ngân chi nhánh</span><h1>Hóa đơn</h1><p>Tạo hóa đơn từ lịch khám đã hoàn tất, kiểm tra và phát hành cho bệnh nhân.</p></div><button type="button" onClick={() => setShowCreate(true)}>+ Tạo hóa đơn</button></header>
    <ManagementSectionNav branchId={branchId} active="invoices" />
    {error && <div className="dentist-error" role="alert">{error}</div>}
    {notice && <div className="staff-schedule-notice" role="status">{notice}</div>}
    <section className="branch-management-schedule invoice-management-section"><InvoiceFilters status={status} appointmentCode={appointmentFilterInput} count={invoiceCount} onStatusChange={(nextStatus) => { setStatus(nextStatus); setOffset(0) }} onAppointmentCodeChange={setAppointmentFilterInput} onSearch={searchInvoices} onClear={clearAppointmentFilter} />
      {loading ? <div className="staff-schedule-empty">Đang tải hóa đơn...</div> : <InvoiceList items={items} onSelect={(invoice) => void selectInvoice(invoice)} />}
      {!loading && <InvoicePagination count={invoiceCount} limit={INVOICE_PAGE_SIZE} offset={offset} onChange={setOffset} />}
    </section>
  </div>

    {showCreate && <div className="branch-management-modal-backdrop"><form className="branch-management-modal" role="dialog" aria-modal="true" onSubmit={createInvoice}><h2>Tạo hóa đơn nháp</h2><InvoiceAppointmentHint /><label>Mã lịch hẹn<input required list="completed-appointments" value={appointmentCode} onChange={(event) => setAppointmentCode(event.target.value)} placeholder="VD: APT-..." /></label><datalist id="completed-appointments">{completedAppointments.map((appointment) => <option key={appointment.public_code} value={appointment.public_code}>{appointment.patient_name} — {appointment.service_name_snapshot}</option>)}</datalist><div><button type="button" className="button-secondary" onClick={() => setShowCreate(false)}>Hủy</button><button type="submit" disabled={busy}>Tạo bản nháp</button></div></form></div>}
    {selected && <InvoiceDetailPanel invoice={selected} busy={busy} onClose={() => setSelected(null)} onIssue={() => void issueInvoice()} onVoid={() => setShowVoid(true)} onEdit={openDraftEditor} onRecordPayment={openPayment} onVoidPayment={openVoidPayment} />}
    {showVoid && selected && <div className="branch-management-modal-backdrop invoice-confirm-layer"><form className="branch-management-modal" role="dialog" aria-modal="true" onSubmit={voidInvoice}><h2>Hủy hóa đơn</h2><p>Lý do hủy sẽ được lưu trong nhật ký đối soát.</p><label>Lý do<textarea required minLength={3} maxLength={1000} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} /></label><div><button type="button" className="button-secondary" onClick={() => setShowVoid(false)}>Quay lại</button><button type="submit" disabled={busy}>Xác nhận hủy</button></div></form></div>}
    {showPayment && selected && <PaymentModal invoice={selected} idempotencyKey={paymentAttemptKey} busy={busy} serverError={paymentError} onCancel={() => { setShowPayment(false); setPaymentError('') }} onSubmit={(data) => void recordPayment(data)} />}
    {paymentToVoid && <VoidPaymentModal payment={paymentToVoid} busy={busy} serverError={paymentError} onCancel={() => { setPaymentToVoid(null); setPaymentError('') }} onSubmit={(reason) => void voidPayment(reason)} />}
    {showDraftEditor && selected && <InvoiceDraftEditor invoice={selected} busy={busy} serverError={draftEditorError} onCancel={() => { setShowDraftEditor(false); setDraftEditorError('') }} onSubmit={(data) => void updateDraft(data)} />}
    </main>
  </div>
}
