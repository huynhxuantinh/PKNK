import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { User } from '../types/api'

const mocks = vi.hoisted(() => ({
  user: null as User | null,
  listAppointments: vi.fn(),
  listReadyAppointments: vi.fn(),
  listInvoices: vi.fn(),
  listReviews: vi.fn(),
  listBranches: vi.fn(),
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }))
vi.mock('../api/management', () => ({
  listBranchAppointments: mocks.listAppointments,
  listInvoiceReadyAppointments: mocks.listReadyAppointments,
  listManagedInvoices: mocks.listInvoices,
  listManagedPayosReviewTransactions: mocks.listReviews,
  listManagedOrganizationBranches: mocks.listBranches,
}))

import { BranchDashboardPage } from './BranchDashboardPage'

const directManager: User = {
  id_user: 4,
  email: 'manager@example.test',
  full_name: 'Quản lý chi nhánh',
  email_verified_at: null,
  email_verified: true,
  memberships: [{
    role: 'BRANCH_ADMIN',
    is_active: true,
    organization_id: 1,
    organization_name: 'DentaVie',
    branch_id: 1,
    branch_name: 'DentaVie Quận 1',
  }],
}

const organizationManager: User = {
  ...directManager,
  memberships: [{
    role: 'ORGANIZATION_ADMIN',
    is_active: true,
    organization_id: 1,
    organization_name: 'DentaVie',
    branch_id: null,
    branch_name: null,
  }],
}

const branches = [
  { id_branch: 1, organization_id: 1, name: 'DentaVie Quận 1', is_active: true },
  { id_branch: 2, organization_id: 1, name: 'DentaVie Quận 7', is_active: true },
]

function readyItem(code: string) {
  return {
    appointment_code: code,
    patient_name: `Bệnh nhân ${code}`,
    dentist_name: 'BS. Minh Anh',
    completed_at: '2026-11-04T09:00:00+07:00',
    estimated_total: '350000.00',
    billing_basis: 'PERFORMED_SERVICES' as const,
    performed_services: [{ service_name: 'Lấy cao răng', quantity: 1, unit_price: '350000.00', tooth_reference: '' }],
  }
}

function reviewItem(invoiceId: number) {
  return {
    order_code: 900000 + invoiceId,
    invoice_id: invoiceId,
    invoice_number: `INV-${invoiceId}`,
    patient_name: `Bệnh nhân INV-${invoiceId}`,
    amount: 350000,
    status: 'NEEDS_REVIEW' as const,
    payos_reference: 'SENSITIVE-REFERENCE',
    checkout_url: 'https://example.test/secret-checkout',
    created_at: '2026-11-04T08:00:00+07:00',
    updated_at: '2026-11-04T08:10:00+07:00',
  }
}

async function renderDashboard(initialPath = '/quan-ly-chi-nhanh?chi-nhanh=1') {
  const router = createMemoryRouter([
    { path: '/quan-ly-chi-nhanh', element: <BranchDashboardPage /> },
  ], { initialEntries: [initialPath] })
  let renderer!: ReactTestRenderer
  await act(async () => {
    renderer = create(<RouterProvider router={router} />)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return { renderer, router }
}

function markup(renderer: ReactTestRenderer) {
  return JSON.stringify(renderer.toJSON())
}

describe('BranchDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('window', { setInterval: () => 1, clearInterval: vi.fn() })
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() })
    mocks.user = directManager
    mocks.listAppointments.mockResolvedValue({ data: [], meta: { count: 0 } })
    mocks.listReadyAppointments.mockResolvedValue({ data: [], meta: { count: 0, limit: 4, offset: 0 } })
    mocks.listInvoices.mockResolvedValue({ data: [], meta: { count: 0, limit: 1, offset: 0 } })
    mocks.listReviews.mockResolvedValue({ data: [] })
    mocks.listBranches.mockResolvedValue({ data: branches })
  })

  it('uses server counts for ready visits and issued invoices and shows PayOS review work', async () => {
    mocks.listReadyAppointments.mockResolvedValue({ data: [readyItem('APT-1')], meta: { count: 19, limit: 4, offset: 0 } })
    mocks.listInvoices.mockResolvedValue({ data: [], meta: { count: 13, limit: 1, offset: 0 } })
    mocks.listReviews.mockResolvedValue({ data: [reviewItem(3)] })
    const { renderer } = await renderDashboard()

    expect(markup(renderer)).toContain('19')
    expect(markup(renderer)).toContain('13')
    expect(markup(renderer)).toContain('Bệnh nhân APT-1')
    expect(markup(renderer)).toContain('Bệnh nhân INV-3')
    expect(markup(renderer)).not.toContain('SENSITIVE-REFERENCE')
    expect(markup(renderer)).not.toContain('secret-checkout')
    expect(mocks.listInvoices).toHaveBeenCalledWith(1, { status: 'ISSUED', limit: 1, offset: 0 }, expect.any(AbortSignal))
    expect(renderer.root.findAllByType('a').some((node) => node.props.href === '/quan-ly-chi-nhanh/hoa-don?chi-nhanh=1')).toBe(true)
  })

  it('shows an empty invoice queue when no ready visits or review transactions exist', async () => {
    const { renderer } = await renderDashboard()

    expect(markup(renderer)).toContain('Không có công việc hóa đơn cần ưu tiên')
    expect(markup(renderer)).toContain('Chưa có lịch sắp tới')
  })

  it('keeps the appointment section usable when invoice loading fails and offers retry', async () => {
    mocks.listReadyAppointments
      .mockRejectedValueOnce(new Error('Lỗi tải hàng đợi'))
      .mockResolvedValueOnce({ data: [], meta: { count: 0, limit: 4, offset: 0 } })
    mocks.listAppointments.mockResolvedValue({
      data: [{
        public_code: 'APT-TODAY', branch_id: 1, branch_name: 'DentaVie Quận 1',
        service_name_snapshot: 'Khám tổng quát', patient_name: 'Bệnh nhân hôm nay',
        patient_phone: null, contact_name_snapshot: null, contact_phone_snapshot: null,
        contact_email_snapshot: null, patient_note: '', dentist_name: 'BS. Minh Anh',
        dentist_id: 4, chair_name: 'G1', starts_at: '2099-11-04T10:00:00+07:00',
        ends_at: '2099-11-04T10:30:00+07:00', status: 'CONFIRMED', confirmed_at: null,
        checked_in_at: null, cancelled_at: null, no_show_at: null, cancel_reason: null,
        rescheduled_from_code: null,
      }],
      meta: { count: 1 },
    })
    const { renderer } = await renderDashboard()

    expect(markup(renderer)).toContain('Bệnh nhân hôm nay')
    expect(markup(renderer)).toContain('Lỗi tải hàng đợi')
    const retry = renderer.root.findAllByType('button').find((node) => node.children.join('') === 'Thử lại')
    await act(async () => {
      retry!.props.onClick()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mocks.listReadyAppointments).toHaveBeenCalledTimes(2)
    expect(markup(renderer)).toContain('Không có công việc hóa đơn cần ưu tiên')
  })

  it('reloads all branch-scoped counts without carrying the previous branch data', async () => {
    mocks.user = organizationManager
    mocks.listBranches.mockResolvedValue({ data: branches })
    mocks.listReadyAppointments.mockImplementation((branchId: number) => Promise.resolve({
      data: [readyItem(`BRANCH-${branchId}`)],
      meta: { count: branchId * 10, limit: 4, offset: 0 },
    }))
    const { renderer, router } = await renderDashboard()

    expect(markup(renderer)).toContain('Bệnh nhân BRANCH-1')
    await act(async () => {
      await router.navigate('/quan-ly-chi-nhanh?chi-nhanh=2')
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(markup(renderer)).toContain('DentaVie Quận 7')
    expect(markup(renderer)).toContain('Bệnh nhân BRANCH-2')
    expect(markup(renderer)).not.toContain('Bệnh nhân BRANCH-1')
    expect(mocks.listReadyAppointments).toHaveBeenCalledWith(2, { limit: 4, offset: 0 }, expect.any(AbortSignal))
  })
})
