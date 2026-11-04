import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DentistAppointment, User } from '../types/api'

const mocks = vi.hoisted(() => ({
  auth: { user: null as User | null, isAuthenticated: true },
  listSchedule: vi.fn(),
  getBranch: vi.fn(),
  startAppointment: vi.fn(),
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => mocks.auth }))
vi.mock('../api/dentist', () => ({
  listDentistSchedule: mocks.listSchedule,
  startDentistAppointment: mocks.startAppointment,
}))
vi.mock('../api/booking', () => ({ getBranchDetail: mocks.getBranch }))
vi.mock('../auth/AuthBar', () => ({ AuthBar: () => <button>Tài khoản</button> }))
vi.mock('../seo/Seo', () => ({ Seo: () => null }))

import { DentistDashboardPage } from './DentistDashboardPage'

const branch = {
  id_branch: 1,
  code: 'Q1',
  name: 'DentaVie Quận 1',
  full_address: 'Quận 1, TP. Hồ Chí Minh',
  phone: null,
  email: null,
  province_code: '79',
  province_name: 'TP. Hồ Chí Minh',
  ward_code: '1',
  ward_name: 'Bến Nghé',
  address_line: 'Quận 1',
  location: { latitude: 10.77, longitude: 106.7 },
  is_open_now: true,
  opening_hours: [],
  images: [],
  services: [],
  dentists: [],
}

const dentist: User = {
  id_user: 7,
  email: 'dentist@example.test',
  full_name: 'Trần Minh Anh',
  email_verified_at: null,
  email_verified: true,
  memberships: [{
    role: 'DENTIST',
    is_active: true,
    organization_id: 1,
    organization_name: 'DentaVie',
    branch_id: 1,
    branch_name: 'DentaVie Quận 1',
  }],
}

function appointment(code: string, status: DentistAppointment['status'], branchId = 1): DentistAppointment {
  return {
    public_code: code,
    patient_profile_id: 99,
    branch_id: branchId,
    branch_name: branchId === 1 ? 'DentaVie Quận 1' : 'DentaVie Quận 7',
    branch_service_id: 8,
    service_name_snapshot: 'Khám tổng quát',
    chair_id: 2,
    chair_name: 'G02',
    patient_name: `Bệnh nhân ${code}`,
    patient_phone: '0900000000',
    contact_name_snapshot: null,
    contact_phone_snapshot: null,
    contact_email_snapshot: null,
    patient_note: '',
    starts_at: '2026-11-04T09:00:00+07:00',
    ends_at: '2026-11-04T09:30:00+07:00',
    status,
    confirmed_at: null,
    checked_in_at: null,
    started_at: null,
  }
}

async function renderDashboard(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer
  await act(async () => {
    renderer = create(
      <MemoryRouter initialEntries={['/bac-si?chi-nhanh=1']}>
        <DentistDashboardPage />
      </MemoryRouter>,
    )
    await Promise.resolve()
    await Promise.resolve()
  })
  return renderer
}

function pageText(renderer: ReactTestRenderer) {
  return JSON.stringify(renderer.toJSON())
}

describe('DentistDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('window', { setInterval: () => 1, clearInterval: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn(), getElementById: vi.fn(() => null) })
    mocks.auth = { user: dentist, isAuthenticated: true }
    mocks.getBranch.mockResolvedValue({ data: branch })
    mocks.listSchedule.mockResolvedValue({ data: [] })
    mocks.startAppointment.mockResolvedValue({ data: appointment('A1', 'IN_PROGRESS') })
  })

  it('shows the assigned branch and empty states when there are no appointments', async () => {
    const renderer = await renderDashboard()

    expect(pageText(renderer)).toContain('DentaVie Quận 1')
    expect(pageText(renderer)).toContain('Chưa có bệnh nhân cần xử lý ngay.')
    expect(pageText(renderer)).toContain('Chưa có lịch khám trong khoảng đã chọn.')
    expect(renderer.root.findAllByType('a').some((node) => node.children.join('').includes('Đổi chi nhánh'))).toBe(false)
  })

  it('connects dashboard anchors to their sections and the branch link to branch selection', async () => {
    const renderer = await renderDashboard()
    const overviewLink = renderer.root.findAllByType('a').find((node) => node.props.href === '#overview')
    const scheduleLink = renderer.root.findAllByType('a').find((node) => node.props.href === '#schedule')
    const branchLink = renderer.root.findAllByType('a').find((node) => node.children.join('') === 'Chi nhánh')

    expect(overviewLink).toBeDefined()
    expect(scheduleLink).toBeDefined()
    expect(renderer.root.findByProps({ id: 'overview' })).toBeDefined()
    expect(renderer.root.findByProps({ id: 'schedule' })).toBeDefined()
    expect(branchLink?.props.href).toBe('/bac-si/chon-chi-nhanh')

    await act(async () => { scheduleLink!.props.onClick() })
    expect(renderer.root.findAllByType('a').find((node) => node.props.href === '#schedule')?.props.className).toBe('is-active')
  })

  it('offers branch switching when the dentist is assigned to several branches', async () => {
    mocks.auth = {
      user: {
        ...dentist,
        memberships: [
          ...dentist.memberships!,
          { ...dentist.memberships![0], branch_id: 2, branch_name: 'DentaVie Quận 7' },
        ],
      },
      isAuthenticated: true,
    }
    const renderer = await renderDashboard()

    expect(renderer.root.findAllByType('a').some((node) => node.children.join('').includes('Đổi chi nhánh'))).toBe(true)
  })

  it('prioritizes in-progress appointments and only offers actions for eligible states', async () => {
    mocks.listSchedule.mockResolvedValue({
      data: [
        appointment('CHECKED', 'CHECKED_IN'),
        appointment('CONFIRMED', 'CONFIRMED'),
        appointment('PROGRESS', 'IN_PROGRESS'),
        appointment('OTHER_BRANCH', 'CHECKED_IN', 2),
      ],
    })
    const renderer = await renderDashboard()
    const priorityCards = renderer.root.findAll((node) => node.props.className === 'dentist-priority-card')

    expect(priorityCards).toHaveLength(2)
    expect(priorityCards[0].findByType('h3').children.join('')).toContain('PROGRESS')
    expect(priorityCards[1].findByType('h3').children.join('')).toContain('CHECKED')
    expect(pageText(renderer)).not.toContain('OTHER_BRANCH')
    expect(renderer.root.findAllByType('button').filter((node) => node.children.join('').includes('Bắt đầu khám'))).toHaveLength(2)
    expect(pageText(renderer)).toContain('Chờ đến lượt')
  })

  it('retries schedule loading after an API failure', async () => {
    mocks.listSchedule
      .mockRejectedValueOnce(new Error('Lỗi kết nối'))
      .mockResolvedValueOnce({ data: [] })
    const renderer = await renderDashboard()

    expect(pageText(renderer)).toContain('Không thể tải lịch khám.')
    const retry = renderer.root.findAllByType('button').find((node) => node.children.join('') === 'Thử lại')
    await act(async () => {
      retry!.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.listSchedule).toHaveBeenCalledTimes(2)
    expect(pageText(renderer)).toContain('Chưa có lịch khám trong khoảng đã chọn.')
  })

  it('switches to history and filters appointments by status', async () => {
    mocks.listSchedule.mockResolvedValue({
      data: [appointment('DONE', 'COMPLETED'), appointment('ABSENT', 'NO_SHOW')],
    })
    const renderer = await renderDashboard()
    const historyTab = renderer.root.findAllByType('button').find((node) => node.children.join('') === 'Đã khám')
    await act(async () => {
      historyTab!.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })
    const statusSelect = renderer.root.findAllByType('select').at(-1)!
    await act(async () => {
      statusSelect.props.onChange({ target: { value: 'NO_SHOW' } })
    })

    expect(pageText(renderer)).toContain('Bệnh nhân ABSENT')
    expect(pageText(renderer)).not.toContain('Bệnh nhân DONE')
  })

  it('filters upcoming appointments by the selected day range', async () => {
    const tomorrow = appointment('TOMORROW', 'CONFIRMED')
    tomorrow.starts_at = '2026-11-05T09:00:00+07:00'
    tomorrow.ends_at = '2026-11-05T09:30:00+07:00'
    mocks.listSchedule.mockResolvedValue({ data: [appointment('TODAY', 'CONFIRMED'), tomorrow] })
    const renderer = await renderDashboard()
    const dayRange = renderer.root.findAllByType('select')[0]

    await act(async () => {
      dayRange.props.onChange({ target: { value: 'TOMORROW' } })
    })

    expect(pageText(renderer)).toContain('Bệnh nhân TOMORROW')
    expect(pageText(renderer)).not.toContain('Bệnh nhân TODAY')
  })
})
