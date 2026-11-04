import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'

import {
  createManagedInvoice, createManagedPayosCheckout, getManagedInvoice, issueManagedInvoice, listInvoiceReadyAppointments, listManagedInvoices, listManagedPayosReviewTransactions,
  postManagedPayment, voidManagedInvoice, voidManagedPayment,
  resolveManagedPayosReviewTransaction, updateManagedInvoiceDraft, type InvoiceReadyAppointment, type ManagedInvoice, type ManagedInvoiceDraftInput,
  type ManagedInvoicePayment, type ManagedInvoiceStatus, type ManagedPayosCheckout, type ManagedPaymentInput, type ManagedPayosReviewTransaction,
} from '../api/management'
import { useAuth } from '../auth/AuthContext'
import { canAccessArea } from '../auth/roles'
import {
  InvoiceAppointmentHint, InvoiceReadyAppointmentQueue,
  InvoiceDraftEditor,
  InvoiceDetailPanel,
  InvoiceFilters,
  InvoiceList,
  InvoiceTable,
  InvoicePagination,
  PaymentChoiceModal, PaymentModal, PayosCheckoutModal,
  VoidPaymentModal,
} from '../components/branch-management/InvoiceManagement'
import {
  latestVoidedInvoiceId,
} from '../components/branch-management/invoicePresentation'
import { useManagedBranches } from '../components/branch-management/useManagedBranches'
import './BranchInvoicesPage.legacy.css'

const INVOICE_PAGE_SIZE = 20
const INVOICE_READY_PAGE_SIZE = 10

export function BranchInvoicesPage() {
  const { user } = useAuth()
  const { branches } = useManagedBranches(user)
  const [params] = useSearchParams()
  const branchId = Number(params.get('chi-nhanh')) || 0
  const [status, setStatus] = useState<ManagedInvoiceStatus | ''>('')
  const [appointmentFilterInput, setAppointmentFilterInput] = useState('')
  const [appliedAppointmentFilter, setAppliedAppointmentFilter] = useState('')
  const [items, setItems] = useState<ManagedInvoice[]>([])
  const [invoiceCount, setInvoiceCount] = useState(0)
  const [issuedCount, setIssuedCount] = useState<number | null>(null)
  const [paidCount, setPaidCount] = useState<number | null>(null)
  const [queueMode, setQueueMode] = useState<'READY' | 'ISSUED'>('READY')
  const [issuedQueue, setIssuedQueue] = useState<ManagedInvoice[]>([])
  const [issuedQueueLoading, setIssuedQueueLoading] = useState(true)
  const [invoiceSummaryError, setInvoiceSummaryError] = useState('')
  const [offset, setOffset] = useState(0)
  const [readyAppointments, setReadyAppointments] = useState<InvoiceReadyAppointment[]>([])
  const [reviewTransactions, setReviewTransactions] = useState<ManagedPayosReviewTransaction[]>([])
  const [reviewToResolve, setReviewToResolve] = useState<ManagedPayosReviewTransaction | null>(null)
  const [reviewAction, setReviewAction] = useState<'CONFIRM_RECEIVED' | 'MARK_NOT_RECEIVED'>('CONFIRM_RECEIVED')
  const [reviewReason, setReviewReason] = useState('')
  const [reviewReference, setReviewReference] = useState('')
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
  const currentBranch = branches.find((branch) => branch.id_branch === branchId)

  const loadInvoiceSummary = useCallback(async () => {
    if (!branchId) return
    const requestId = loadRequestId.current
    try {
      const [issued, paid, queue] = await Promise.all([
        listManagedInvoices(branchId, { status: 'ISSUED', limit: 1 }),
        listManagedInvoices(branchId, { status: 'PAID', limit: 1 }),
        listManagedInvoices(branchId, { status: 'ISSUED', limit: 5 }),
      ])
      if (activeBranchId.current !== branchId || requestId !== loadRequestId.current) return
      setIssuedCount(issued.meta.count)
      setPaidCount(paid.meta.count)
      setIssuedQueue(queue.data)
      setInvoiceSummaryError('')
    } catch {
      if (activeBranchId.current === branchId && requestId === loadRequestId.current) {
        setIssuedCount(null)
        setPaidCount(null)
        setIssuedQueue([])
        setInvoiceSummaryError('Không thể tải số liệu thu ngân. Vui lòng thử lại.')
      }
    } finally {
      if (activeBranchId.current === branchId && requestId === loadRequestId.current) setIssuedQueueLoading(false)
    }
  }, [branchId])

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
      void loadInvoiceSummary()
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
  }, [appliedAppointmentFilter, branchId, offset, status, loadInvoiceSummary])

  useEffect(() => {
    loadRequestId.current += 1
    selectedInvoiceRequestId.current += 1
    setScopeReady(false)
    setLoading(true)
    setItems([])
    setInvoiceCount(0)
    setIssuedCount(null)
    setPaidCount(null)
    setIssuedQueue([])
    setIssuedQueueLoading(true)
    setInvoiceSummaryError('')
    setQueueMode('READY')
    setReadyAppointments([])
    setReviewTransactions([])
    setReviewToResolve(null)
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

  const loadReviewTransactions = useCallback(async () => {
    if (!branchId) return
    try {
      const response = await listManagedPayosReviewTransactions(branchId)
      if (isCurrentBranch()) setReviewTransactions(response.data)
    } catch (caught) {
      if (isCurrentBranch()) setError(caught instanceof Error ? caught.message : 'Không thể tải giao dịch cần đối soát.')
    }
  // isCurrentBranch reads the current ref; only branch changes should recreate the loader.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId])

  useEffect(() => { void loadReviewTransactions() }, [loadReviewTransactions])

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

  async function voidPayment(reason: string, cashRefundConfirmed: boolean) {
    if (!selected || !paymentToVoid || !scopeReady) return
    setBusy(true); setPaymentError(''); setNotice('')
    try {
      await voidManagedPayment(paymentToVoid.id_payment, reason, cashRefundConfirmed)
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

  async function resolveReview(event: FormEvent) {
    event.preventDefault()
    if (!reviewToResolve || !scopeReady) return
    setBusy(true); setError(''); setNotice('')
    try {
      await resolveManagedPayosReviewTransaction(reviewToResolve.order_code, {
        action: reviewAction,
        reason: reviewReason.trim(),
        ...(reviewAction === 'CONFIRM_RECEIVED' ? { received_amount: reviewToResolve.amount, payos_reference: reviewReference.trim() } : {}),
      })
      if (!isCurrentBranch()) return
      setReviewToResolve(null); setReviewReason(''); setReviewReference('')
      setNotice('Đã lưu kết quả đối soát payOS.')
      await Promise.all([loadReviewTransactions(), loadInvoices()])
    } catch (caught) { if (isCurrentBranch()) setError(caught instanceof Error ? caught.message : 'Không thể xử lý giao dịch cần đối soát.') }
    finally { setBusy(false) }
  }

  if (!canAccessArea(user, 'MANAGEMENT') || !branchId) return <Navigate to="/quan-ly-chi-nhanh" replace />
  return <div className="branch-management-page invoice-management-page">
    <main><div className="branch-management-main">
    <Link className="staff-schedule-back" to={`/quan-ly-chi-nhanh?chi-nhanh=${branchId}`}>← Quay lại quản lý chi nhánh</Link>
    <header className="invoice-management-heading"><div><span>Thu ngân &amp; quản lý hóa đơn</span><h1>Hóa đơn &amp; thanh toán</h1><p>Ưu tiên xử lý lượt khám chờ lập hóa đơn, theo dõi tiền cần thu và đối soát giao dịch payOS.</p></div><div className="invoice-heading-actions"><span className="invoice-branch-pill">{currentBranch?.name || `Chi nhánh #${branchId}`}</span><button type="button" disabled={!scopeReady} onClick={() => setShowCreate(true)}>＋ Lập hóa đơn mới</button></div></header>
    {error && <div className="app-error" role="alert">{error}</div>}
    {notice && <div className="staff-schedule-notice" role="status">{notice}</div>}
    <section className="invoice-overview" aria-labelledby="invoice-overview-title">
      <div className="invoice-section-heading"><div><span className="invoice-kicker">01 · Tổng quan thanh toán</span><h2 id="invoice-overview-title">Việc cần xử lý trước</h2></div><small>Số liệu theo chi nhánh đang chọn</small></div>
      <div className="invoice-kpi-grid">
        <article><span className="invoice-kpi-icon is-amber">▤</span><div><small>Chờ lập hóa đơn</small><strong>{loadingReadyAppointments ? '—' : readyAppointmentCount.toLocaleString('vi-VN')}</strong><p>Lượt khám đã hoàn tất</p></div></article>
        <article><span className="invoice-kpi-icon is-blue">▣</span><div><small>Đã phát hành · chờ thu</small><strong>{issuedCount === null ? '—' : issuedCount.toLocaleString('vi-VN')}</strong><p>Hóa đơn chưa thanh toán</p></div></article>
        <article className={reviewTransactions.length ? 'has-review' : ''}><span className="invoice-kpi-icon is-red">◇</span><div><small>payOS cần đối soát</small><strong>{reviewTransactions.length.toLocaleString('vi-VN')}</strong><p>Cần xác minh tiền thực nhận</p></div></article>
        <article><span className="invoice-kpi-icon is-green">✓</span><div><small>Đã thanh toán</small><strong>{paidCount === null ? '—' : paidCount.toLocaleString('vi-VN')}</strong><p>Hóa đơn đã ghi nhận</p></div></article>
      </div>
      {reviewTransactions.length > 0 && <aside className="invoice-review-alert"><span aria-hidden="true">!</span><div><strong>{reviewTransactions.length} giao dịch payOS đang cần đối soát</strong><p>Chỉ xác nhận sau khi kiểm tra khoản tiền thực nhận và mã tham chiếu. Không tự chuyển hóa đơn sang “Đã thanh toán”.</p></div><button type="button" onClick={() => document.getElementById('payos-review-heading')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Kiểm tra giao dịch ›</button></aside>}
    </section>
    <div className="invoice-work-grid">
    <section className="invoice-queue-panel" aria-labelledby="invoice-queue-title">
      <header className="invoice-panel-heading"><div><span className="invoice-kicker">02 · Hàng đợi thu ngân</span><h2 id="invoice-queue-title">Hóa đơn cần xử lý</h2><p>Ưu tiên các hồ sơ cần lập hóa đơn và hóa đơn đã phát hành.</p></div><button type="button" className="invoice-view-all" onClick={() => { setQueueMode('ISSUED'); setStatus('ISSUED'); setOffset(0) }}>Xem tất cả ›</button></header>
      <div className="invoice-queue-tabs" role="tablist" aria-label="Hàng đợi hóa đơn">
        <button type="button" role="tab" aria-selected={queueMode === 'READY'} className={queueMode === 'READY' ? 'is-active' : ''} onClick={() => setQueueMode('READY')}>Chờ lập hóa đơn ({readyAppointmentCount})</button>
        <button type="button" role="tab" aria-selected={queueMode === 'ISSUED'} className={queueMode === 'ISSUED' ? 'is-active' : ''} onClick={() => setQueueMode('ISSUED')}>Chờ thu tiền ({issuedCount ?? '—'})</button>
      </div>
      {queueMode === 'READY' ? <InvoiceReadyAppointmentQueue
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
      /> : issuedQueueLoading ? <p className="invoice-queue-message">Đang tải hóa đơn chờ thu...</p> : invoiceSummaryError ? <div className="invoice-queue-message" role="alert">{invoiceSummaryError} <button className="invoice-queue-retry" type="button" onClick={() => { setIssuedQueueLoading(true); void loadInvoiceSummary() }}>Thử lại</button></div> : issuedQueue.length ? <div className="invoice-issued-queue">{issuedQueue.map((invoice) => <article key={invoice.id_invoice}><span className="invoice-patient-avatar">{invoice.patient_name.split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase()}</span><div className="invoice-issued-identity"><strong>{invoice.patient_name}</strong><small>{invoice.invoice_number} · {invoice.appointment_code}</small><small>{invoice.lines.map((line) => line.description).join(', ')}</small></div><div className="invoice-issued-total"><strong>{Number(invoice.total).toLocaleString('vi-VN')} ₫</strong><small>Giá trị hóa đơn</small></div><button type="button" onClick={() => void selectInvoice(invoice)}>Xem &amp; thu tiền</button></article>)}</div> : <p className="invoice-queue-message">Hiện không có hóa đơn chờ thu tiền.</p>}
    </section>
    <aside className="invoice-process-panel"><h2><span aria-hidden="true">↗</span> Quy trình thu tiền</h2><ol><li><b>01</b><div><strong>Lập và kiểm tra hóa đơn</strong><p>Chọn lượt khám đã hoàn tất, kiểm tra dịch vụ, giá và chiết khấu.</p></div></li><li><b>02</b><div><strong>Phát hành hóa đơn</strong><p>Xác nhận nội dung trước khi hóa đơn được phép thanh toán.</p></div></li><li><b>03</b><div><strong>Thu tiền hoặc tạo QR payOS</strong><p>Tiền mặt ghi nhận tại quầy; QR chờ hệ thống xác nhận kết quả.</p></div></li></ol><p className="invoice-process-note">✓ Tiền mặt và payOS là hai luồng riêng. Không ghi nhận trùng thanh toán khi QR còn hiệu lực.</p></aside>
    </div>
    {reviewTransactions.length > 0 && <section className="invoice-review-panel" aria-labelledby="payos-review-heading"><header className="invoice-panel-heading"><div><span className="invoice-kicker">Đối soát thủ công payOS</span><h2 id="payos-review-heading">Giao dịch cần kiểm tra</h2><p>Chỉ xác nhận sau khi đã đối chiếu tiền thực nhận và mã tham chiếu.</p></div></header><div className="invoice-review-list">{reviewTransactions.map((item) => <article key={item.order_code}><div><strong>{item.invoice_number}</strong><small>{item.patient_name} · {item.order_code}</small></div><strong>{item.amount.toLocaleString('vi-VN')} ₫</strong><button type="button" disabled={busy} onClick={() => { setReviewToResolve(item); setReviewAction('CONFIRM_RECEIVED'); setReviewReason(''); setReviewReference(item.payos_reference) }}>Đối soát</button></article>)}</div></section>}
    <section className="invoice-list-panel"><InvoiceFilters status={status} appointmentCode={appointmentFilterInput} count={invoiceCount} onStatusChange={(nextStatus) => { setStatus(nextStatus); setOffset(0) }} onAppointmentCodeChange={setAppointmentFilterInput} onSearch={searchInvoices} onClear={clearAppointmentFilter} />
      {loading ? <div className="staff-schedule-empty">Đang tải hóa đơn...</div> : <><div className="invoice-desktop-table"><InvoiceTable items={items} onSelect={(invoice) => void selectInvoice(invoice)} /></div><div className="invoice-mobile-list"><InvoiceList items={items} onSelect={(invoice) => void selectInvoice(invoice)} /></div></>}
      {!loading && <InvoicePagination count={invoiceCount} limit={INVOICE_PAGE_SIZE} offset={offset} onChange={setOffset} />}
    </section>
  </div>

    {showCreate && <div className="branch-management-modal-backdrop"><form className="branch-management-modal" role="dialog" aria-modal="true" onSubmit={createInvoice}><h2>Tạo hóa đơn nháp</h2><InvoiceAppointmentHint /><label>Mã lịch hẹn<input required list="ready-appointments" value={appointmentCode} onChange={(event) => setAppointmentCode(event.target.value)} placeholder="VD: APT-..." /></label><datalist id="ready-appointments">{readyAppointments.map((appointment) => <option key={appointment.appointment_code} value={appointment.appointment_code}>{appointment.patient_name} — {appointment.performed_services.map((service) => service.service_name).join(', ')}</option>)}</datalist><div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setShowCreate(false)}>Hủy</button><button type="submit" disabled={busy}>Tạo bản nháp</button></div></form></div>}
    {selected && <InvoiceDetailPanel invoice={selected} busy={busy} onClose={() => setSelected(null)} onIssue={() => void issueInvoice()} onVoid={() => setShowVoid(true)} onEdit={openDraftEditor} onRecordPayment={openPayment} onVoidPayment={openVoidPayment} />}
    {showVoid && selected && <div className="branch-management-modal-backdrop invoice-confirm-layer"><form className="branch-management-modal" role="dialog" aria-modal="true" onSubmit={voidInvoice}><h2>Hủy hóa đơn</h2><p>Lý do hủy sẽ được lưu trong nhật ký đối soát.</p><label>Lý do<textarea required minLength={3} maxLength={1000} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} /></label><div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setShowVoid(false)}>Quay lại</button><button type="submit" disabled={busy}>Xác nhận hủy</button></div></form></div>}
    {showPayment && selected && paymentMode === 'CHOICE' && <PaymentChoiceModal busy={busy} onCancel={() => { setShowPayment(false); setPaymentError('') }} onCash={() => setPaymentMode('CASH')} onPayos={() => void createPayosCheckout()} />}
    {showPayment && selected && paymentMode === 'CASH' && <PaymentModal invoice={selected} idempotencyKey={paymentAttemptKey} busy={busy} serverError={paymentError} onCancel={() => { setPaymentMode('CHOICE'); setPaymentError('') }} onSubmit={(data) => void recordPayment(data)} />}
    {showPayment && selected && paymentMode === 'PAYOS' && <PayosCheckoutModal checkout={payosCheckout} busy={busy} serverError={paymentError} onCancel={() => { setShowPayment(false); setPaymentMode('CHOICE'); setPayosCheckout(null); setPaymentError('') }} onRetry={() => void (payosCheckout ? refreshPayosPaymentStatus() : createPayosCheckout())} />}
    {paymentToVoid && <VoidPaymentModal payment={paymentToVoid} busy={busy} serverError={paymentError} onCancel={() => { setPaymentToVoid(null); setPaymentError('') }} onSubmit={(reason, cashRefundConfirmed) => void voidPayment(reason, cashRefundConfirmed)} />}
    {showDraftEditor && selected && <InvoiceDraftEditor invoice={selected} busy={busy} serverError={draftEditorError} onCancel={() => { setShowDraftEditor(false); setDraftEditorError('') }} onSubmit={(data) => void updateDraft(data)} />}
    {reviewToResolve && <div className="branch-management-modal-backdrop"><form className="branch-management-modal" role="dialog" aria-modal="true" onSubmit={resolveReview}><h2>Đối soát giao dịch PayOS</h2><p>Hóa đơn {reviewToResolve.invoice_number} · {reviewToResolve.amount.toLocaleString('vi-VN')} ₫ · mã đơn {reviewToResolve.order_code}</p><label>Kết quả<select value={reviewAction} onChange={(event) => setReviewAction(event.target.value as 'CONFIRM_RECEIVED' | 'MARK_NOT_RECEIVED')}><option value="CONFIRM_RECEIVED">Đã xác minh tiền thực nhận</option><option value="MARK_NOT_RECEIVED">Không nhận được tiền</option></select></label>{reviewAction === 'CONFIRM_RECEIVED' && <label>Mã tham chiếu PayOS<input required value={reviewReference} onChange={(event) => setReviewReference(event.target.value)} /></label>}<label>Lý do/ghi chú đối soát<textarea required minLength={3} maxLength={1000} value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} /></label><div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setReviewToResolve(null)}>Hủy</button><button type="submit" disabled={busy}>{reviewAction === 'CONFIRM_RECEIVED' ? 'Xác nhận đã nhận tiền' : 'Đánh dấu không nhận tiền'}</button></div></form></div>}
    </main>
  </div>
}
