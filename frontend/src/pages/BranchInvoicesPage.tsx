import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'

import {
  createManagedInvoice, createManagedPayosCheckout, getManagedInvoice, issueManagedInvoice, listInvoiceReadyAppointments, listManagedInvoices,
  postManagedPayment, voidManagedInvoice, voidManagedPayment,
  updateManagedInvoiceDraft, type InvoiceReadyAppointment, type ManagedInvoice, type ManagedInvoiceDraftInput,
  type ManagedInvoicePayment, type ManagedInvoiceStatus, type ManagedPayosCheckout, type ManagedPaymentInput,
} from '../api/management'
import { useAuth } from '../auth/AuthContext'
import { canAccessArea } from '../auth/roles'
import {
  InvoiceAppointmentHint, InvoiceReadyAppointmentQueue,
  InvoiceDraftEditor,
  InvoiceDetailPanel,
  InvoiceFilters,
  InvoiceTable,
  InvoicePagination,
  PaymentChoiceModal, PaymentModal, PayosCheckoutModal,
  VoidPaymentModal,
} from '../components/branch-management/InvoiceManagement'
import {
  latestVoidedInvoiceId,
} from '../components/branch-management/invoicePresentation'

const INVOICE_PAGE_SIZE = 20
const INVOICE_READY_PAGE_SIZE = 10

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
  const [readyAppointments, setReadyAppointments] = useState<InvoiceReadyAppointment[]>([])
  const [loadingReadyAppointments, setLoadingReadyAppointments] = useState(true)
  const [readyAppointmentsError, setReadyAppointmentsError] = useState('')
  const [readyAppointmentCount, setReadyAppointmentCount] = useState(0)
  const [readyAppointmentOffset, setReadyAppointmentOffset] = useState(0)
  const [readyDateFrom, setReadyDateFrom] = useState('')
  const [readyDateTo, setReadyDateTo] = useState('')
  const [appliedReadyDateFrom, setAppliedReadyDateFrom] = useState('')
  const [appliedReadyDateTo, setAppliedReadyDateTo] = useState('')
  const [selected, setSelected] = useState<ManagedInvoice | null>(null)
  const [appointmentCode, setAppointmentCode] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showVoid, setShowVoid] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [paymentMode, setPaymentMode] = useState<'CHOICE' | 'CASH' | 'PAYOS'>('CHOICE')
  const [payosCheckout, setPayosCheckout] = useState<ManagedPayosCheckout | null>(null)
  const [showDraftEditor, setShowDraftEditor] = useState(false)
  const [paymentAttemptKey, setPaymentAttemptKey] = useState('')
  const [paymentToVoid, setPaymentToVoid] = useState<ManagedInvoicePayment | null>(null)
  const [paymentError, setPaymentError] = useState('')
  const [draftEditorError, setDraftEditorError] = useState('')
  const [voidReason, setVoidReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [scopeReady, setScopeReady] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const loadRequestId = useRef(0)
  const selectedInvoiceRequestId = useRef(0)
  const activeBranchId = useRef(branchId)
  activeBranchId.current = branchId
  const isCurrentBranch = () => activeBranchId.current === branchId

  const loadInvoices = useCallback(async (signal?: AbortSignal) => {
    if (!branchId) return
    const requestId = ++loadRequestId.current
    setLoading(true)
    try {
      const response = await listManagedInvoices(branchId, {
        status: status || undefined,
        appointmentCode: appliedAppointmentFilter || undefined,
        limit: INVOICE_PAGE_SIZE,
        offset,
      }, signal)
      if (signal?.aborted || branchId !== activeBranchId.current || requestId !== loadRequestId.current) return
      if (offset > 0 && response.data.length === 0) {
        setOffset(Math.max(0, offset - INVOICE_PAGE_SIZE))
        return
      }
      setItems(response.data)
      setInvoiceCount(response.meta.count)
      setError('')
    } catch (caught) {
      if (signal?.aborted || branchId !== activeBranchId.current || requestId !== loadRequestId.current) return
      setInvoiceCount(0)
      setError(caught instanceof Error ? caught.message : 'Không thể tải hóa đơn.')
    }
    finally {
      if (!signal?.aborted && branchId === activeBranchId.current && requestId === loadRequestId.current) {
        setLoading(false)
        setScopeReady(true)
      }
    }
  }, [appliedAppointmentFilter, branchId, offset, status])

  useEffect(() => {
    loadRequestId.current += 1
    selectedInvoiceRequestId.current += 1
    setScopeReady(false)
    setLoading(true)
    setItems([])
    setInvoiceCount(0)
    setReadyAppointments([])
    setLoadingReadyAppointments(true)
    setReadyAppointmentsError('')
    setReadyAppointmentCount(0)
    setReadyAppointmentOffset(0)
    setReadyDateFrom('')
    setReadyDateTo('')
    setAppliedReadyDateFrom('')
    setAppliedReadyDateTo('')
    setSelected(null)
    setAppointmentCode('')
    setShowCreate(false)
    setShowVoid(false)
    setShowPayment(false)
    setPaymentMode('CHOICE')
    setPayosCheckout(null)
    setShowDraftEditor(false)
    setPaymentToVoid(null)
    setPaymentError('')
    setDraftEditorError('')
    setVoidReason('')
    setError('')
    setNotice('')
    setOffset(0)
  }, [branchId])

  useEffect(() => {
    const controller = new AbortController()
    void loadInvoices(controller.signal)
    return () => controller.abort()
  }, [loadInvoices])
  const loadReadyAppointments = useCallback(async (signal?: AbortSignal) => {
    if (!branchId) return
    setLoadingReadyAppointments(true)
    setReadyAppointmentsError('')
    try {
      const response = await listInvoiceReadyAppointments(branchId, {
        dateFrom: appliedReadyDateFrom || undefined,
        dateTo: appliedReadyDateTo || undefined,
        limit: INVOICE_READY_PAGE_SIZE,
        offset: readyAppointmentOffset,
      }, signal)
      if (!signal?.aborted && isCurrentBranch()) {
        if (readyAppointmentOffset > 0 && response.data.length === 0) {
          setReadyAppointmentOffset(Math.max(0, readyAppointmentOffset - INVOICE_READY_PAGE_SIZE))
          return
        }
        setReadyAppointments(response.data)
        setReadyAppointmentCount(response.meta.count)
      }
    } catch (caught) {
      if (!signal?.aborted && isCurrentBranch()) {
        setReadyAppointments([])
        setReadyAppointmentCount(0)
        setReadyAppointmentsError(caught instanceof Error ? caught.message : 'Không thể tải hàng đợi lập hóa đơn.')
      }
    } finally {
      if (!signal?.aborted && isCurrentBranch()) setLoadingReadyAppointments(false)
    }
  // isCurrentBranch reads the current ref; only branch changes should recreate the loader.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedReadyDateFrom, appliedReadyDateTo, branchId, readyAppointmentOffset])

  useEffect(() => {
    if (!branchId) return
    const controller = new AbortController()
    void loadReadyAppointments(controller.signal)
    return () => controller.abort()
  }, [branchId, loadReadyAppointments])

  function applyReadyFilters() {
    if (readyDateFrom && readyDateTo && readyDateFrom > readyDateTo) {
      setError('Ngày đến phải sau hoặc bằng ngày từ.')
      return
    }
    setError('')
    setReadyAppointmentOffset(0)
    setAppliedReadyDateFrom(readyDateFrom)
    setAppliedReadyDateTo(readyDateTo)
  }

  function clearReadyFilters() {
    setReadyDateFrom('')
    setReadyDateTo('')
    setAppliedReadyDateFrom('')
    setAppliedReadyDateTo('')
    setReadyAppointmentOffset(0)
  }

  async function selectInvoice(invoice: ManagedInvoice) {
    if (!scopeReady) return
    const requestId = ++selectedInvoiceRequestId.current
    setError('')
    try {
      const response = await getManagedInvoice(invoice.id_invoice)
      if (requestId === selectedInvoiceRequestId.current) setSelected(response.data)
    }
    catch (caught) {
      if (requestId === selectedInvoiceRequestId.current) setError(caught instanceof Error ? caught.message : 'Không thể tải chi tiết hóa đơn.')
    }
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
    event.preventDefault()
    if (!scopeReady) return
    setBusy(true); setError(''); setNotice('')
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
      if (!isCurrentBranch()) return
      setShowCreate(false); setAppointmentCode(''); setSelected(response.data); setNotice('Đã tạo hóa đơn nháp.'); await Promise.all([loadInvoices(), loadReadyAppointments()])
    } catch (caught) { if (!isCurrentBranch()) return; setError(caught instanceof Error ? caught.message : 'Không thể tạo hóa đơn.') }
    finally { setBusy(false) }
  }

  async function issueInvoice() {
    if (!selected || !scopeReady) return
    setBusy(true); setError(''); setNotice('')
    try { const response = await issueManagedInvoice(selected.id_invoice); if (!isCurrentBranch()) return; setSelected(response.data); setNotice('Đã phát hành hóa đơn.'); await loadInvoices() }
    catch (caught) { if (!isCurrentBranch()) return; setError(caught instanceof Error ? caught.message : 'Không thể phát hành hóa đơn.') }
    finally { setBusy(false) }
  }

  async function voidInvoice(event: FormEvent) {
    event.preventDefault()
    if (!selected || !scopeReady) return
    setBusy(true); setError(''); setNotice('')
    try { const response = await voidManagedInvoice(selected.id_invoice, voidReason.trim()); if (!isCurrentBranch()) return; setSelected(response.data); setShowVoid(false); setVoidReason(''); setNotice('Đã hủy hóa đơn.'); await loadInvoices() }
    catch (caught) { if (!isCurrentBranch()) return; setError(caught instanceof Error ? caught.message : 'Không thể hủy hóa đơn.') }
    finally { setBusy(false) }
  }

  function openPayment() {
    if (!scopeReady) return
    setPaymentError('')
    setPaymentAttemptKey(crypto.randomUUID())
    setPaymentMode('CHOICE')
    setPayosCheckout(null)
    setShowPayment(true)
  }

  async function createPayosCheckout() {
    if (!selected || !scopeReady) return
    setBusy(true); setPaymentError(''); setNotice('')
    try {
      const response = await createManagedPayosCheckout(selected.id_invoice)
      if (!isCurrentBranch()) return
      setPayosCheckout(response.data)
      setPaymentMode('PAYOS')
      setNotice('Đã tạo mã QR payOS. Hệ thống sẽ tự xác minh khi khách thanh toán.')
    } catch (caught) {
      if (!isCurrentBranch()) return
      setPaymentError(caught instanceof Error ? caught.message : 'Không thể tạo mã QR payOS.')
      setPaymentMode('PAYOS')
    } finally { setBusy(false) }
  }

  async function refreshPayosPaymentStatus() {
    if (!selected || !scopeReady) return
    setBusy(true); setPaymentError('')
    try {
      const response = await getManagedInvoice(selected.id_invoice)
      if (!isCurrentBranch()) return
      setSelected(response.data)
      if (response.data.status === 'PAID') {
        setShowPayment(false); setPaymentMode('CHOICE'); setPayosCheckout(null)
        setNotice('payOS đã xác minh thanh toán.')
        await loadInvoices()
      } else setNotice('payOS chưa xác minh thanh toán. Mã QR vẫn đang chờ.')
    } catch (caught) {
      if (!isCurrentBranch()) return
      setPaymentError(caught instanceof Error ? caught.message : 'Không thể kiểm tra trạng thái payOS.')
    } finally { setBusy(false) }
  }

  useEffect(() => {
    if (!showPayment || paymentMode !== 'PAYOS' || !payosCheckout || !selected) return
    const timer = window.setInterval(() => { void refreshPayosPaymentStatus() }, 5000)
    return () => window.clearInterval(timer)
  // The interval only watches the active counter checkout; its handler reads current state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPayment, paymentMode, payosCheckout?.order_code, selected?.id_invoice])

  async function recordPayment(data: ManagedPaymentInput) {
    if (!selected || !scopeReady) return
    setBusy(true); setPaymentError(''); setNotice('')
    try {
      await postManagedPayment(selected.id_invoice, data)
      const refreshed = await getManagedInvoice(selected.id_invoice)
      if (!isCurrentBranch()) return
      setSelected(refreshed.data); setShowPayment(false); setPaymentMode('CHOICE'); setPayosCheckout(null); setPaymentAttemptKey(''); setNotice('Đã ghi nhận thanh toán.'); await loadInvoices()
    } catch (caught) { if (!isCurrentBranch()) return; setPaymentError(caught instanceof Error ? caught.message : 'Không thể ghi nhận thanh toán.') }
    finally { setBusy(false) }
  }

  function openVoidPayment(payment: ManagedInvoicePayment) {
    if (!scopeReady) return
    setPaymentError('')
    setPaymentToVoid(payment)
  }

  async function voidPayment(reason: string) {
    if (!selected || !paymentToVoid || !scopeReady) return
    setBusy(true); setPaymentError(''); setNotice('')
    try {
      await voidManagedPayment(paymentToVoid.id_payment, reason)
      const refreshed = await getManagedInvoice(selected.id_invoice)
      if (!isCurrentBranch()) return
      setSelected(refreshed.data); setPaymentToVoid(null); setNotice('Đã hủy thanh toán.'); await loadInvoices()
    } catch (caught) { if (!isCurrentBranch()) return; setPaymentError(caught instanceof Error ? caught.message : 'Không thể hủy thanh toán.') }
    finally { setBusy(false) }
  }

  function openDraftEditor() {
    if (!scopeReady) return
    setDraftEditorError('')
    setShowDraftEditor(true)
  }

  async function updateDraft(data: ManagedInvoiceDraftInput) {
    if (!selected || !scopeReady) return
    setBusy(true); setDraftEditorError(''); setNotice('')
    try {
      const response = await updateManagedInvoiceDraft(selected.id_invoice, data)
      if (!isCurrentBranch()) return
      setSelected(response.data); setShowDraftEditor(false); setNotice('Đã cập nhật hóa đơn nháp.'); await loadInvoices()
    } catch (caught) { if (!isCurrentBranch()) return; setDraftEditorError(caught instanceof Error ? caught.message : 'Không thể cập nhật hóa đơn nháp.') }
    finally { setBusy(false) }
  }

  if (!canAccessArea(user, 'MANAGEMENT') || !branchId) return <Navigate to="/quan-ly-chi-nhanh" replace />
  return <div className="branch-management-page invoice-management-page">
    <main><div className="branch-management-main">
    <Link className="staff-schedule-back" to={`/quan-ly-chi-nhanh?chi-nhanh=${branchId}`}>← Quay lại quản lý chi nhánh</Link>
    <header className="invoice-management-heading"><div><span>Thu ngân chi nhánh</span><h1>Hóa đơn</h1><p>Tạo hóa đơn từ lịch khám đã hoàn tất, kiểm tra và phát hành cho bệnh nhân.</p></div><button type="button" disabled={!scopeReady} onClick={() => setShowCreate(true)}>+ Tạo hóa đơn</button></header>
    {error && <div className="dentist-error" role="alert">{error}</div>}
    {notice && <div className="staff-schedule-notice" role="status">{notice}</div>}
    <InvoiceReadyAppointmentQueue
      appointments={readyAppointments}
      loading={loadingReadyAppointments}
      error={readyAppointmentsError}
      count={readyAppointmentCount}
      limit={INVOICE_READY_PAGE_SIZE}
      offset={readyAppointmentOffset}
      dateFrom={readyDateFrom}
      dateTo={readyDateTo}
      onDateFromChange={setReadyDateFrom}
      onDateToChange={setReadyDateTo}
      onApplyFilters={applyReadyFilters}
      onClearFilters={clearReadyFilters}
      onPageChange={setReadyAppointmentOffset}
      onCreate={(appointment) => { setAppointmentCode(appointment.appointment_code); setShowCreate(true) }}
      onRetry={() => void loadReadyAppointments()}
    />
    <section className="branch-management-schedule invoice-management-section"><InvoiceFilters status={status} appointmentCode={appointmentFilterInput} count={invoiceCount} onStatusChange={(nextStatus) => { setStatus(nextStatus); setOffset(0) }} onAppointmentCodeChange={setAppointmentFilterInput} onSearch={searchInvoices} onClear={clearAppointmentFilter} />
      {loading ? <div className="staff-schedule-empty">Đang tải hóa đơn...</div> : <InvoiceTable items={items} onSelect={(invoice) => void selectInvoice(invoice)} />}
      {!loading && <InvoicePagination count={invoiceCount} limit={INVOICE_PAGE_SIZE} offset={offset} onChange={setOffset} />}
    </section>
  </div>

    {showCreate && <div className="branch-management-modal-backdrop"><form className="branch-management-modal" role="dialog" aria-modal="true" onSubmit={createInvoice}><h2>Tạo hóa đơn nháp</h2><InvoiceAppointmentHint /><label>Mã lịch hẹn<input required list="ready-appointments" value={appointmentCode} onChange={(event) => setAppointmentCode(event.target.value)} placeholder="VD: APT-..." /></label><datalist id="ready-appointments">{readyAppointments.map((appointment) => <option key={appointment.appointment_code} value={appointment.appointment_code}>{appointment.patient_name} — {appointment.performed_services.map((service) => service.service_name).join(', ')}</option>)}</datalist><div><button type="button" className="button-secondary" onClick={() => setShowCreate(false)}>Hủy</button><button type="submit" disabled={busy}>Tạo bản nháp</button></div></form></div>}
    {selected && <InvoiceDetailPanel invoice={selected} busy={busy} onClose={() => setSelected(null)} onIssue={() => void issueInvoice()} onVoid={() => setShowVoid(true)} onEdit={openDraftEditor} onRecordPayment={openPayment} onVoidPayment={openVoidPayment} />}
    {showVoid && selected && <div className="branch-management-modal-backdrop invoice-confirm-layer"><form className="branch-management-modal" role="dialog" aria-modal="true" onSubmit={voidInvoice}><h2>Hủy hóa đơn</h2><p>Lý do hủy sẽ được lưu trong nhật ký đối soát.</p><label>Lý do<textarea required minLength={3} maxLength={1000} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} /></label><div><button type="button" className="button-secondary" onClick={() => setShowVoid(false)}>Quay lại</button><button type="submit" disabled={busy}>Xác nhận hủy</button></div></form></div>}
    {showPayment && selected && paymentMode === 'CHOICE' && <PaymentChoiceModal busy={busy} onCancel={() => { setShowPayment(false); setPaymentError('') }} onCash={() => setPaymentMode('CASH')} onPayos={() => void createPayosCheckout()} />}
    {showPayment && selected && paymentMode === 'CASH' && <PaymentModal invoice={selected} idempotencyKey={paymentAttemptKey} busy={busy} serverError={paymentError} onCancel={() => { setPaymentMode('CHOICE'); setPaymentError('') }} onSubmit={(data) => void recordPayment(data)} />}
    {showPayment && selected && paymentMode === 'PAYOS' && <PayosCheckoutModal checkout={payosCheckout} busy={busy} serverError={paymentError} onCancel={() => { setShowPayment(false); setPaymentMode('CHOICE'); setPayosCheckout(null); setPaymentError('') }} onRetry={() => void (payosCheckout ? refreshPayosPaymentStatus() : createPayosCheckout())} />}
    {paymentToVoid && <VoidPaymentModal payment={paymentToVoid} busy={busy} serverError={paymentError} onCancel={() => { setPaymentToVoid(null); setPaymentError('') }} onSubmit={(reason) => void voidPayment(reason)} />}
    {showDraftEditor && selected && <InvoiceDraftEditor invoice={selected} busy={busy} serverError={draftEditorError} onCancel={() => { setShowDraftEditor(false); setDraftEditorError('') }} onSubmit={(data) => void updateDraft(data)} />}
    </main>
  </div>
}
