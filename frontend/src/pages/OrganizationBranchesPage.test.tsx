import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OrganizationBranch } from '../api/organization'
import { OrganizationBranchesPage } from './OrganizationBranchesPage'

const apiMocks = vi.hoisted(() => ({
  createOrganizationBranch: vi.fn(),
  listOrganizationBranches: vi.fn(),
  listProvinces: vi.fn(),
  listWards: vi.fn(),
  updateOrganizationBranch: vi.fn(),
  listManagedBranchDentists: vi.fn(),
  listManagedBranchServices: vi.fn(),
  listManagedChairs: vi.fn(),
}))

vi.mock('../api/organization', () => apiMocks)
vi.mock('../api/management', () => apiMocks)
vi.mock('../components/organization-management/useOrganizationScope', () => ({
  useOrganizationScope: () => ({
    organizationId: 7,
    options: [{ id: 7, name: 'Test organization' }],
  }),
}))
vi.mock('../components/organization-management/OrganizationPageLayout', () => ({
  OrganizationPageLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('../components/admin/ui', () => ({
  AdminModal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DataTable: ({
    rows,
    columns,
  }: {
    rows: OrganizationBranch[]
    columns: Array<{
      key: string
      cell: (branch: OrganizationBranch) => ReactNode
    }>
  }) => (
    <div>
      {rows.map((branch) => (
        <div key={branch.id_branch} data-branch-id={branch.id_branch}>
          {columns.find((column) => column.key === 'actions')?.cell(branch)}
        </div>
      ))}
    </div>
  ),
  EmptyState: () => null,
  StatusBadge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))
vi.mock('../components/ConfirmationModal', () => ({ ConfirmationModal: () => null }))
vi.mock('../components/organization-management/OrganizationBranchModal', () => ({
  OrganizationBranchModal: () => null,
}))

const branches: OrganizationBranch[] = [
  {
    id_branch: 1,
    organization_id: 7,
    code: 'BR-1',
    name: 'Chi nhánh Một',
    phone: null,
    email: null,
    province_code: '79',
    ward_code: '00001',
    address_line: 'Địa chỉ 1',
    location: null,
    is_active: true,
    created_at: '',
    updated_at: '',
  },
  {
    id_branch: 2,
    organization_id: 7,
    code: 'BR-2',
    name: 'Chi nhánh Hai',
    phone: null,
    email: null,
    province_code: '79',
    ward_code: '00002',
    address_line: 'Địa chỉ 2',
    location: null,
    is_active: false,
    created_at: '',
    updated_at: '',
  },
]

describe('OrganizationBranchesPage', () => {
  let renderer: ReactTestRenderer | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.listProvinces.mockResolvedValue({ data: [] })
    apiMocks.listWards.mockResolvedValue({ data: [] })
    apiMocks.listOrganizationBranches.mockResolvedValue({ data: branches })
    apiMocks.listManagedBranchDentists.mockImplementation((branchId: number) =>
      branchId === 1
        ? Promise.resolve({ data: [{ is_active: true }, { is_active: true }] })
        : Promise.reject(new Error('Branch details unavailable')),
    )
    apiMocks.listManagedBranchServices.mockImplementation((branchId: number) =>
      branchId === 1
        ? Promise.resolve({ data: [{ is_active: true }] })
        : Promise.reject(new Error('Branch details unavailable')),
    )
    apiMocks.listManagedChairs.mockImplementation((branchId: number) =>
      branchId === 1
        ? Promise.resolve({ data: [{ is_active: true }, { is_active: false }] })
        : Promise.reject(new Error('Branch details unavailable')),
    )
  })

  it('hides previous branch KPIs after details fail for the newly selected branch', async () => {
    await act(async () => {
      renderer = create(
        <MemoryRouter>
          <OrganizationBranchesPage />
        </MemoryRouter>,
      )
      await Promise.resolve()
    })

    const openDetails = (branchId: number) =>
      renderer!.root
        .findByProps({ 'data-branch-id': branchId })
        .findAllByType('button')
        .find((button) => button.children.includes('Chi tiết'))

    await act(async () => {
      openDetails(1)?.props.onClick()
      await Promise.resolve()
    })
    expect(renderer!.root.findByProps({ className: 'organization-detail-kpis' }).findAllByType('strong').map((node) => node.children[0])).toEqual(['2', '1', '1'])

    await act(async () => {
      openDetails(2)?.props.onClick()
      await Promise.resolve()
    })

    expect(renderer!.root.findAllByProps({ className: 'organization-detail-kpis' })).toHaveLength(0)
    expect(renderer!.root.findByProps({ role: 'alert' }).children).toContain('Branch details unavailable')

    await act(async () => renderer!.unmount())
  })
})
