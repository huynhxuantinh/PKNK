import { renderToStaticMarkup } from 'react-dom/server'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'

import type { ManagedInvoice, ManagedInvoicePayment } from '../../api/management'
import {
  InvoiceAppointmentHint,
  InvoiceDraftEditor,
  InvoiceDetailPanel,
  InvoiceFilters,
  InvoiceList,
  InvoicePagination,
  PaymentModal,
  VoidPaymentModal,
} from './InvoiceManagement'
import { latestVoidedInvoiceId } from './invoicePresentation'

const draftInvoice = {
  id_invoice: 11,
  invoice_number: 'INV-2026-0011',
  appointment_code: 'APT-0011',
  branch_id: 5,
  patient_profile_id: 8,
  patient_name: 'Nguyễn Minh Anh',
  replacement_for_id: null,
  status: 'DRAFT' as const,
  currency: 'VND',
  subtotal: '500000.00',
  discount: '0.00',
  total: '500000.00',
  lines: [{ id_invoice_line: 1, service_id: 3, service_code_snapshot: 'GENERAL', description: 'Khám tổng quát', quantity: 1, unit_price: '500000.00', line_total: '500000.00' }],
  payments: [],
  issued_at: null,
  paid_at: null,
  voided_at: null,
  void_reason: '',
  created_at: '2026-10-24T08:00:00+07:00',
} satisfies ManagedInvoice

describe('invoice management UI', () => {
  it('renders invoice identity, patient, total and detail action', () => {
    const markup = renderToStaticMarkup(<InvoiceList items={[draftInvoice]} onSelect={() => {}} />)

    expect(markup).toContain('INV-2026-0011')
    expect(markup).toContain('Nguyễn Minh Anh')
    expect(markup).toContain('500.000')
    expect(markup).toContain('Xem chi tiết')
  })

  it('only offers payment for an issued invoice', () => {
    const detail = (invoice: ManagedInvoice) => renderToStaticMarkup(
      <InvoiceDetailPanel invoice={invoice} busy={false} onClose={() => {}} onIssue={() => {}} onVoid={() => {}} onEdit={() => {}} onRecordPayment={() => {}} onVoidPayment={() => {}} />,
    )
    const issued = { ...draftInvoice, status: 'ISSUED' as const, issued_at: '2026-10-24T09:00:00+07:00' }
    const paid = { ...issued, status: 'PAID' as const, paid_at: '2026-10-24T09:05:00+07:00' }
    const voided = { ...issued, status: 'VOID' as const, voided_at: '2026-10-24T09:10:00+07:00' }

    expect(detail(issued)).toContain('Ghi nhận thanh toán')
    expect(detail(draftInvoice)).not.toContain('Ghi nhận thanh toán')
    expect(detail(paid)).not.toContain('Ghi nhận thanh toán')
    expect(detail(voided)).not.toContain('Ghi nhận thanh toán')
  })

  it('only offers draft editing before the invoice is issued', () => {
    const detail = (invoice: ManagedInvoice) => renderToStaticMarkup(
      <InvoiceDetailPanel invoice={invoice} busy={false} onClose={() => {}} onIssue={() => {}} onVoid={() => {}} onEdit={() => {}} onRecordPayment={() => {}} onVoidPayment={() => {}} />,
    )
    const issued = { ...draftInvoice, status: 'ISSUED' as const, issued_at: '2026-10-24T09:00:00+07:00' }

    expect(detail(draftInvoice)).toContain('Chỉnh sửa')
    expect(detail(issued)).not.toContain('Chỉnh sửa')
  })

  it('updates line values and submits editable draft data', () => {
    const onSubmit = vi.fn()
    let renderer: ReactTestRenderer
    act(() => { renderer = create(<InvoiceDraftEditor invoice={draftInvoice} busy={false} onCancel={() => {}} onSubmit={onSubmit} />) })

    act(() => { renderer!.root.findByProps({ name: 'line-description' }).props.onChange({ target: { value: 'Điều trị tổng quát' } }) })
    act(() => { renderer!.root.findByProps({ name: 'line-quantity' }).props.onChange({ target: { value: '2' } }) })
    act(() => { renderer!.root.findByProps({ name: 'line-unit-price' }).props.onChange({ target: { value: '300000' } }) })
    act(() => { renderer!.root.findByProps({ name: 'invoice-discount' }).props.onChange({ target: { value: '10000' } }) })
    act(() => { renderer!.root.findByProps({ 'aria-label': 'Chỉnh sửa hóa đơn nháp' }).props.onSubmit({ preventDefault() {} }) })

    expect(onSubmit).toHaveBeenCalledWith({
      discount: '10000',
      lines: [{ service: 3, description: 'Điều trị tổng quát', quantity: 2, unit_price: '300000' }],
    })
    expect(JSON.stringify(renderer!.toJSON())).toContain('600.000')
  })

  it('supports adding and removing draft lines', () => {
    let renderer: ReactTestRenderer
    act(() => { renderer = create(<InvoiceDraftEditor invoice={draftInvoice} busy={false} onCancel={() => {}} onSubmit={() => {}} />) })

    act(() => { renderer!.root.findByProps({ 'aria-label': 'Thêm dòng hóa đơn' }).props.onClick() })
    expect(renderer!.root.findAllByProps({ name: 'line-description' })).toHaveLength(2)
    act(() => { renderer!.root.findAllByProps({ 'aria-label': 'Xóa dòng hóa đơn' })[1].props.onClick() })
    expect(renderer!.root.findAllByProps({ name: 'line-description' })).toHaveLength(1)
  })

  it('rejects invalid quantities, prices and excessive discounts', () => {
    const onSubmit = vi.fn()
    let renderer: ReactTestRenderer
    act(() => { renderer = create(<InvoiceDraftEditor invoice={draftInvoice} busy={false} onCancel={() => {}} onSubmit={onSubmit} />) })

    act(() => { renderer!.root.findByProps({ name: 'line-quantity' }).props.onChange({ target: { value: '0' } }) })
    act(() => { renderer!.root.findByProps({ name: 'line-unit-price' }).props.onChange({ target: { value: '-1' } }) })
    act(() => { renderer!.root.findByProps({ name: 'invoice-discount' }).props.onChange({ target: { value: '600000' } }) })
    act(() => { renderer!.root.findByProps({ 'aria-label': 'Chỉnh sửa hóa đơn nháp' }).props.onSubmit({ preventDefault() {} }) })

    expect(onSubmit).not.toHaveBeenCalled()
    expect(renderer!.root.findByProps({ role: 'alert' }).children.join('')).toContain('Số lượng')
  })

  it('keeps the payment amount and idempotency key unchanged across retries', () => {
    const onSubmit = vi.fn()
    const issued = { ...draftInvoice, status: 'ISSUED' as const, issued_at: '2026-10-24T09:00:00+07:00' }
    let renderer: ReactTestRenderer

    act(() => { renderer = create(<PaymentModal invoice={issued} idempotencyKey="payment-attempt-001" busy={false} onCancel={() => {}} onSubmit={onSubmit} />) })
    const form = renderer!.root.findByProps({ 'aria-label': 'Ghi nhận thanh toán' })
    act(() => { form.props.onSubmit({ preventDefault() {} }) })
    act(() => { form.props.onSubmit({ preventDefault() {} }) })

    expect(onSubmit).toHaveBeenCalledTimes(2)
    expect(onSubmit.mock.calls[0][0]).toEqual({ method: 'CASH', amount: '500000.00', external_reference: '', idempotency_key: 'payment-attempt-001' })
    expect(onSubmit.mock.calls[1][0].idempotency_key).toBe('payment-attempt-001')
  })

  it('rejects a bank transfer without a transaction reference', () => {
    const onSubmit = vi.fn()
    const issued = { ...draftInvoice, status: 'ISSUED' as const, issued_at: '2026-10-24T09:00:00+07:00' }
    let renderer: ReactTestRenderer

    act(() => { renderer = create(<PaymentModal invoice={issued} idempotencyKey="payment-attempt-002" busy={false} onCancel={() => {}} onSubmit={onSubmit} />) })
    act(() => { renderer!.root.findByProps({ name: 'payment-method' }).props.onChange({ target: { value: 'BANK_TRANSFER' } }) })
    act(() => { renderer!.root.findByProps({ 'aria-label': 'Ghi nhận thanh toán' }).props.onSubmit({ preventDefault() {} }) })

    expect(onSubmit).not.toHaveBeenCalled()
    expect(renderer!.root.findByProps({ role: 'alert' }).children.join('')).toContain('mã giao dịch')
  })

  it('requires a reason before voiding a posted payment', () => {
    const onSubmit = vi.fn()
    const payment = { id_payment: 7, payment_number: 'PAY-0007', method: 'CASH', amount: '500000.00', status: 'POSTED', external_reference: '', source: 'MANUAL', posted_at: '2026-10-24T09:05:00+07:00', voided_at: null, void_reason: '' } satisfies ManagedInvoicePayment
    let renderer: ReactTestRenderer

    act(() => { renderer = create(<VoidPaymentModal payment={payment} busy={false} onCancel={() => {}} onSubmit={onSubmit} />) })
    act(() => { renderer!.root.findByProps({ 'aria-label': 'Hủy thanh toán' }).props.onSubmit({ preventDefault() {} }) })

    expect(onSubmit).not.toHaveBeenCalled()
    expect(renderer!.root.findByProps({ role: 'alert' }).children.join('')).toContain('lý do')
  })

  it('renders bounded invoice pagination controls', () => {
    const markup = renderToStaticMarkup(
      <InvoicePagination
        count={45}
        limit={20}
        offset={20}
        onChange={() => {}}
      />,
    )

    expect(markup).toContain('Trang 2 / 3')
    expect(markup).toContain('Trang trước')
    expect(markup).toContain('Trang sau')
  })

  it('renders invoice count and searches by appointment code', () => {
    const onSearch = vi.fn()
    const onStatusChange = vi.fn()
    let renderer: ReactTestRenderer
    act(() => { renderer = create(<InvoiceFilters status="" appointmentCode="APT-2026" count={37} onStatusChange={onStatusChange} onAppointmentCodeChange={() => {}} onSearch={onSearch} onClear={() => {}} />) })

    expect(renderer!.root.findByType('span').children.join('')).toBe('Tổng 37 hóa đơn')
    expect(renderer!.root.findByProps({ name: 'appointment-code-filter' }).props.value).toBe('APT-2026')
    act(() => { renderer!.root.findByProps({ 'aria-label': 'Lọc hóa đơn' }).props.onSubmit({ preventDefault() {} }) })
    act(() => { renderer!.root.findByProps({ name: 'invoice-status-filter' }).props.onChange({ target: { value: 'PAID' } }) })

    expect(onSearch).toHaveBeenCalledOnce()
    expect(onStatusChange).toHaveBeenCalledWith('PAID')
  })

  it('selects the most recently voided invoice for replacement', () => {
    const older = {
      ...draftInvoice,
      id_invoice: 12,
      status: 'VOID' as const,
      voided_at: '2026-10-20T10:00:00+07:00',
      created_at: '2026-10-24T10:00:00+07:00',
    }
    const newer = {
      ...draftInvoice,
      id_invoice: 13,
      status: 'VOID' as const,
      voided_at: '2026-10-23T10:00:00+07:00',
      created_at: '2026-10-19T10:00:00+07:00',
    }

    expect(latestVoidedInvoiceId([older, draftInvoice, newer])).toBe(13)
  })

  it('explains how to create an invoice for an older appointment', () => {
    const markup = renderToStaticMarkup(<InvoiceAppointmentHint />)

    expect(markup).toContain('30 ngày gần nhất')
    expect(markup).toContain('nhập trực tiếp mã lịch hẹn')
  })
})
