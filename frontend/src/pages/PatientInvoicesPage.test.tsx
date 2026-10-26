import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiRequest } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { PatientInvoicesPage } from './PatientRecordsPages'

vi.mock('../api/client', () => ({
  apiRequest: vi.fn(),
  downloadAuthenticatedFile: vi.fn(),
}))
vi.mock('../api/billing', () => ({ createPayosPayment: vi.fn() }))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../auth/AuthBar', () => ({ AuthBar: () => null }))
vi.mock('../seo/Seo', () => ({ Seo: () => null }))

const invoice = {
  id_invoice: 1,
  invoice_number: 'INV-001',
  appointment_code: 'APT-001',
  branch_name: 'PKNK Dental An Khánh',
  status: 'ISSUED' as const,
  currency: 'VND',
  subtotal: '500000',
  discount: '0',
  total: '500000',
  issued_at: '2026-10-26T08:00:00+07:00',
  paid_at: null,
}

describe('PatientInvoicesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: true,
      isAuthReady: true,
      updateUser: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    } as ReturnType<typeof useAuth>)
  })

  it('shows only the error state when loading invoices fails', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error('Network error'))
    let renderer: ReactTestRenderer

    await act(async () => {
      renderer = create(
        <MemoryRouter initialEntries={['/hoa-don']}>
          <PatientInvoicesPage />
        </MemoryRouter>,
      )
    })

    const markup = JSON.stringify(renderer!.toJSON())
    expect(markup).toContain('Không thể tải hóa đơn.')
    expect(markup).not.toContain('Đang tải hóa đơn...')
  })

  it('loads the selected invoice page and renders pagination controls', async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({
        data: [invoice],
        meta: { count: 21, page: 1, page_size: 10, total_pages: 3 },
      })
      .mockResolvedValueOnce({
        data: [{ ...invoice, id_invoice: 2, invoice_number: 'INV-002' }],
        meta: { count: 21, page: 2, page_size: 10, total_pages: 3 },
      })
    let renderer: ReactTestRenderer

    await act(async () => {
      renderer = create(
        <MemoryRouter initialEntries={['/hoa-don']}>
          <PatientInvoicesPage />
        </MemoryRouter>,
      )
    })

    const pagination = renderer!.root.findByProps({ 'aria-label': 'Phân trang hóa đơn' })
    const nextButton = pagination.findAllByType('button')[1]
    await act(async () => {
      nextButton.props.onClick()
    })

    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      '/patients/me/invoices/?page=2&page_size=10',
      {},
      { auth: true },
    )
    expect(JSON.stringify(renderer!.toJSON())).toContain('Trang 2 / 3')
  })
})
