import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({
  user: {
    id_user: 1,
    email: 'manager@example.test',
    full_name: 'Quản lý',
    email_verified: true,
    email_verified_at: null,
    memberships: [{
      role: 'ORGANIZATION_ADMIN',
      is_active: true,
      organization_id: 3,
      organization_name: 'DentaVie',
      branch_id: null,
      branch_name: null,
    }],
  },
  listManagedInvoices: vi.fn(),
  listInvoiceReadyAppointments: vi.fn(),
  listManagedPayosReviewTransactions: vi.fn(),
  listManagedOrganizationBranches: vi.fn(),
  getManagedInvoice: vi.fn(),
  createManagedInvoice: vi.fn(),
  voidManagedInvoice: vi.fn(),
  issueManagedInvoice: vi.fn(),
  createManagedPayosCheckout: vi.fn(),
  postManagedPayment: vi.fn(),
  voidManagedPayment: vi.fn(),
  resolveManagedPayosReviewTransaction: vi.fn(),
  updateManagedInvoiceDraft: vi.fn(),
}))

vi.mock('../api/management', () => mocks)
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user }),
}))

import { BranchInvoicesPage } from './BranchInvoicesPage'
import type { InvoiceReadyAppointment, ManagedInvoice } from '../api/management'

const readyAppointment = {
  appointment_code: 'APT-2026-0042',
  patient_name: 'Nguyễn Minh Anh',
  dentist_name: 'BS. An',
  completed_at: '2026-11-04T09:00:00+07:00',
  estimated_total: '500000.00',
  billing_basis: 'PERFORMED_SERVICES',
  performed_services: [{ service_name: 'Khám tổng quát', quantity: 1, unit_price: '500000.00', tooth_reference: '' }],
} satisfies InvoiceReadyAppointment

const invoiceTemplate = {
  id_invoice: 41,
  invoice_number: 'HD-2026-0041',
  appointment_code: readyAppointment.appointment_code,
  branch_id: 5,
  patient_profile_id: 8,
  patient_name: readyAppointment.patient_name,
  replacement_for_id: null,
  status: 'DRAFT' as const,
  currency: 'VND' as const,
  subtotal: '500000.00',
  discount: '0.00',
  total: '500000.00',
  lines: [{ id_invoice_line: 1, service_id: 3, service_code_snapshot: 'GENERAL', description: 'Khám tổng quát', quantity: 1, unit_price: '500000.00', line_total: '500000.00' }],
  payments: [],
  issued_at: null,
  paid_at: null,
  voided_at: null,
  void_reason: '',
  created_at: '2026-11-04T09:00:00+07:00',
} satisfies ManagedInvoice

let invoices: ManagedInvoice[]
let renderer: ReactTestRenderer

function textOf(node: { children: Array<string | { children: unknown[] }> }): string {
  return node.children.map((child) => typeof child === 'string' ? child : textOf(child as { children: Array<string | { children: unknown[] }> })).join('')
}

function findButton(label: string) {
  return renderer.root.findAllByType('button').find((button) => textOf(button) === label)
}

function findDialogForm() {
  return renderer.root.findAllByProps({ role: 'dialog' }).find((dialog) => dialog.type === 'form')
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
}

function SwitchBranchControl() {
  const [, setParams] = useSearchParams()
  return <button type="button" onClick={() => setParams({ 'chi-nhanh': '6' })}>Đổi chi nhánh kiểm thử</button>
}

describe('BranchInvoicesPage replacement invoice flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invoices = []
    mocks.listManagedOrganizationBranches.mockResolvedValue({ data: [
      { id_branch: 5, organization_id: 3, name: 'DentaVie Quận 1', is_active: true },
      { id_branch: 6, organization_id: 3, name: 'DentaVie Quận 7', is_active: true },
    ] })
    mocks.listManagedInvoices.mockImplementation(async (branchId: number, options: { status?: string; appointmentCode?: string; limit?: number; offset?: number } = {}) => {
      const matching = invoices.filter((invoice) => invoice.branch_id === branchId
        && (!options.status || invoice.status === options.status)
        && (!options.appointmentCode || invoice.appointment_code === options.appointmentCode))
      return { data: matching.slice(options.offset || 0, (options.offset || 0) + (options.limit || 20)), meta: { count: matching.length, limit: options.limit || 20, offset: options.offset || 0 } }
    })
    mocks.listInvoiceReadyAppointments.mockImplementation(async (branchId: number) => {
      const activeInvoice = invoices.some((invoice) => invoice.branch_id === branchId && invoice.appointment_code === readyAppointment.appointment_code && invoice.status !== 'VOID')
      return { data: activeInvoice || branchId !== 5 ? [] : [readyAppointment], meta: { count: activeInvoice || branchId !== 5 ? 0 : 1, limit: 10, offset: 0 } }
    })
    mocks.listManagedPayosReviewTransactions.mockResolvedValue({ data: [] })
    mocks.createManagedInvoice.mockImplementation(async (branchId: number, code: string, replacementForId?: number) => {
      const created: ManagedInvoice = { ...invoiceTemplate, id_invoice: invoices.length ? Math.max(...invoices.map((invoice) => invoice.id_invoice)) + 1 : invoiceTemplate.id_invoice, invoice_number: `HD-2026-${String(invoices.length + 41).padStart(4, '0')}`, branch_id: branchId, appointment_code: code, replacement_for_id: replacementForId ?? null }
      invoices = [...invoices, created]
      return { data: created }
    })
    mocks.voidManagedInvoice.mockImplementation(async (id: number, reason: string) => {
      invoices = invoices.map((invoice) => invoice.id_invoice === id ? { ...invoice, status: 'VOID', voided_at: '2026-11-04T10:00:00+07:00', void_reason: reason } : invoice)
      return { data: invoices.find((invoice) => invoice.id_invoice === id)! }
    })
    mocks.getManagedInvoice.mockImplementation(async (id: number) => ({ data: invoices.find((invoice) => invoice.id_invoice === id)! }))
  })

  it('voids an unpaid invoice, restores its appointment, then creates a linked replacement', async () => {
    await act(async () => {
      renderer = create(<MemoryRouter initialEntries={[`/?chi-nhanh=5`]}><Routes><Route path="/" element={<BranchInvoicesPage />} /></Routes></MemoryRouter>)
    })
    await flush()

    await act(async () => { findButton('＋ Lập hóa đơn mới')!.props.onClick() })
    const createDialog = findDialogForm()!
    const appointmentInput = createDialog.findByType('input')
    act(() => { appointmentInput.props.onChange({ target: { value: readyAppointment.appointment_code } }) })
    await act(async () => { createDialog.props.onSubmit({ preventDefault() {} }); await Promise.resolve(); await Promise.resolve() })
    await flush()
    expect(mocks.createManagedInvoice).toHaveBeenNthCalledWith(1, 5, readyAppointment.appointment_code, undefined)
    expect(invoices).toHaveLength(1)

    await act(async () => { findButton('Hủy hóa đơn')!.props.onClick() })
    const voidDialog = findDialogForm()!
    const reason = voidDialog.findByType('textarea')
    act(() => { reason.props.onChange({ target: { value: 'Tạo nhầm hóa đơn' } }) })
    await act(async () => { voidDialog.props.onSubmit({ preventDefault() {} }); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
    await flush()

    expect(invoices[0].status).toBe('VOID')
    expect(mocks.listInvoiceReadyAppointments).toHaveBeenCalledTimes(3)
    expect(textOf(renderer.root)).toContain(readyAppointment.patient_name)
    expect(findButton('Tạo hóa đơn thay thế')).toBeDefined()

    await act(async () => { findButton('Tạo hóa đơn thay thế')!.props.onClick() })
    const replacementDialog = findDialogForm()!
    expect(replacementDialog.findByType('input').props.value).toBe(readyAppointment.appointment_code)
    expect(replacementDialog.findByType('input').props.readOnly).toBe(true)
    await act(async () => { replacementDialog.props.onSubmit({ preventDefault() {} }); await Promise.resolve(); await Promise.resolve() })
    await flush()

    expect(mocks.createManagedInvoice).toHaveBeenNthCalledWith(2, 5, readyAppointment.appointment_code, invoiceTemplate.id_invoice)
    expect(invoices).toHaveLength(2)
    expect(invoices[0].status).toBe('VOID')
    expect(invoices[1].replacement_for_id).toBe(invoices[0].id_invoice)
  })

  it('closes invoice dialogs and clears the selected invoice when the branch changes', async () => {
    await act(async () => {
      renderer = create(<MemoryRouter initialEntries={[`/?chi-nhanh=5`]}><SwitchBranchControl /><Routes><Route path="/" element={<BranchInvoicesPage />} /></Routes></MemoryRouter>)
    })
    await flush()
    await act(async () => { findButton('＋ Lập hóa đơn mới')!.props.onClick() })
    expect(findDialogForm()).toBeDefined()
    await act(async () => { findButton('Đổi chi nhánh kiểm thử')!.props.onClick() })
    await flush()
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    expect(textOf(renderer.root)).toContain('DentaVie Quận 7')
  })

  it.each(['DRAFT', 'ISSUED', 'PAID'] as const)('does not create a replacement while an appointment has an active %s invoice', async (status) => {
    invoices = [{ ...invoiceTemplate, status }]
    await act(async () => {
      renderer = create(<MemoryRouter initialEntries={[`/?chi-nhanh=5`]}><Routes><Route path="/" element={<BranchInvoicesPage />} /></Routes></MemoryRouter>)
    })
    await flush()
    await act(async () => { findButton('＋ Lập hóa đơn mới')!.props.onClick() })
    const createDialog = findDialogForm()!
    act(() => { createDialog.findByType('input').props.onChange({ target: { value: readyAppointment.appointment_code } }) })
    await act(async () => { createDialog.props.onSubmit({ preventDefault() {} }); await Promise.resolve(); await Promise.resolve() })
    await flush()

    expect(mocks.createManagedInvoice).not.toHaveBeenCalled()
    expect(findDialogForm()).toBeDefined()
    expect(renderer.root.findByProps({ role: 'alert' })).toBeDefined()
  })

  it('keeps the cancel dialog open, disables submission while saving, and shows API errors', async () => {
    invoices = [{ ...invoiceTemplate }]
    await act(async () => {
      renderer = create(<MemoryRouter initialEntries={[`/?chi-nhanh=5`]}><Routes><Route path="/" element={<BranchInvoicesPage />} /></Routes></MemoryRouter>)
    })
    await flush()
    await act(async () => { findButton('Xem chi tiết')!.props.onClick() })
    await flush()
    await act(async () => { findButton('Hủy hóa đơn')!.props.onClick() })
    let rejectRequest!: (error: Error) => void
    mocks.voidManagedInvoice.mockReturnValue(new Promise((_resolve, reject) => { rejectRequest = reject }))
    const cancelDialog = findDialogForm()!
    act(() => { cancelDialog.findByType('textarea').props.onChange({ target: { value: 'Hủy nhầm' } }) })
    act(() => { cancelDialog.props.onSubmit({ preventDefault() {} }) })
    expect(findDialogForm()!.findAllByType('button').find((button) => button.props.type === 'submit')?.props.disabled).toBe(true)

    await act(async () => { rejectRequest(new Error('Không thể hủy hóa đơn')); await Promise.resolve() })
    expect(findDialogForm()).toBeDefined()
    expect(renderer.root.findByProps({ role: 'alert' })).toBeDefined()
    expect(findDialogForm()!.findAllByType('button').find((button) => button.props.type === 'submit')?.props.disabled).toBe(false)
  })
})
