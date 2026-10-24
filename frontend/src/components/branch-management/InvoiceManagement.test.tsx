import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { ManagedInvoice } from '../../api/management'
import {
  InvoiceAppointmentHint,
  InvoiceDetailPanel,
  InvoiceList,
  InvoicePagination,
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

  it('allows issuing a draft but keeps payment disabled', () => {
    const markup = renderToStaticMarkup(
      <InvoiceDetailPanel invoice={draftInvoice} busy={false} onClose={() => {}} onIssue={() => {}} onVoid={() => {}} />,
    )

    expect(markup).toContain('Phát hành hóa đơn')
    expect(markup).toContain('Ghi nhận thanh toán')
    expect(markup).toContain('disabled=""')
    expect(markup).toContain('Khám tổng quát')
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
