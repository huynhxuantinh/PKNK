import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'

import {
  createManagedBranchService, createManagedChair, createManagedHoliday, deleteManagedHoliday,
  getManagedBranch, listManagedBranchServices, listManagedChairs, listManagedHolidays,
  listManagedOpeningHours, listManagedOrganizationServices, patchManagedBranchService,
  patchManagedChair, patchManagedHoliday, replaceManagedOpeningHours,
  type ManagedBranchService, type ManagedChair, type ManagedHoliday, type ManagedOpeningHour,
  type ManagedService,
} from '../api/management'
import { useAuth } from '../auth/AuthContext'
import { canAccessArea } from '../auth/roles'
import { BranchChairList, BranchHolidayList, BranchServiceList, OpeningHoursEditor } from '../components/branch-management/BranchConfigurationSections'
import { ManagementPageHeader } from '../components/branch-management/ManagementPageHeader'
import { ManagementSectionNav } from '../components/branch-management/ManagementSectionNav'

const defaultHours = (): ManagedOpeningHour[] => Array.from({ length: 7 }, (_, index) => ({ weekday: index + 1, is_closed: index === 6, open_time: index === 6 ? null : '08:00', close_time: index === 6 ? null : '18:00' }))
const emptyChair = (): { code: string; name: string; resource_type: 'CHAIR' | 'ROOM' } => ({ code: '', name: '', resource_type: 'CHAIR' })
const emptyService = () => ({ service_id: '', price: '', duration_minutes: '30', buffer_minutes: '0' })
const emptyHoliday = () => ({ holiday_date: '', name: '', is_closed: true })

export function BranchConfigurationPage() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const branchId = Number(params.get('chi-nhanh')) || 0
  const [organizationId, setOrganizationId] = useState(0)
  const [hours, setHours] = useState<ManagedOpeningHour[]>(defaultHours)
  const [chairs, setChairs] = useState<ManagedChair[]>([])
  const [services, setServices] = useState<ManagedBranchService[]>([])
  const [catalog, setCatalog] = useState<ManagedService[]>([])
  const [holidays, setHolidays] = useState<ManagedHoliday[]>([])
  const [chairForm, setChairForm] = useState(emptyChair)
  const [serviceForm, setServiceForm] = useState(emptyService)
  const [holidayForm, setHolidayForm] = useState(emptyHoliday)
  const [editingChair, setEditingChair] = useState<number | null>(null)
  const [editingService, setEditingService] = useState<number | null>(null)
  const [editingHoliday, setEditingHoliday] = useState<number | null>(null)
  const [deletingHoliday, setDeletingHoliday] = useState<ManagedHoliday | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const canEditOrganization = user?.memberships?.some((membership) => membership.is_active && membership.role === 'ORGANIZATION_ADMIN' && membership.organization_id === organizationId) ?? false

  const load = useCallback(async () => {
    if (!branchId) return
    try {
      const branchResponse = await getManagedBranch(branchId)
      const orgId = branchResponse.data.organization_id
      setOrganizationId(orgId)
      const [hourResponse, chairResponse, serviceResponse, catalogResponse, holidayResponse] = await Promise.all([
        listManagedOpeningHours(branchId), listManagedChairs(branchId), listManagedBranchServices(branchId),
        listManagedOrganizationServices(orgId), listManagedHolidays(orgId),
      ])
      setHours(hourResponse.data.length === 7 ? hourResponse.data : defaultHours())
      setChairs(chairResponse.data); setServices(serviceResponse.data); setCatalog(catalogResponse.data)
      setHolidays(holidayResponse.data.filter((item) => item.branch_id === null || item.branch_id === branchId))
      setError('')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải cấu hình chi nhánh.') }
  }, [branchId])

  useEffect(() => { void load() }, [load])
  const availableServices = useMemo(() => catalog.filter((item) => item.is_active && !services.some((row) => row.service_id === item.id_service)), [catalog, services])
  const showSuccess = (message: string) => { setNotice(message); setError('') }
  const showError = (caught: unknown, fallback: string) => { setError(caught instanceof Error ? caught.message : fallback); setNotice('') }

  async function saveHours() {
    setBusy(true)
    try { const response = await replaceManagedOpeningHours(branchId, hours); setHours(response.data); showSuccess('Đã lưu giờ mở cửa.') }
    catch (caught) { showError(caught, 'Không thể lưu giờ mở cửa.') }
    finally { setBusy(false) }
  }

  async function saveChair(event: FormEvent) {
    event.preventDefault(); setBusy(true)
    try {
      if (editingChair) await patchManagedChair(editingChair, chairForm)
      else await createManagedChair(branchId, { ...chairForm, is_active: true })
      setChairForm(emptyChair()); setEditingChair(null); await load(); showSuccess('Đã lưu ghế/phòng.')
    } catch (caught) { showError(caught, 'Không thể lưu ghế/phòng.') }
    finally { setBusy(false) }
  }

  function editChair(item: ManagedChair) { setEditingChair(item.id_chair); setChairForm({ code: item.code, name: item.name, resource_type: item.resource_type }) }
  async function toggleChair(item: ManagedChair) { try { await patchManagedChair(item.id_chair, { is_active: !item.is_active }); await load(); showSuccess('Đã cập nhật ghế/phòng.') } catch (caught) { showError(caught, 'Không thể cập nhật ghế/phòng.') } }

  async function saveService(event: FormEvent) {
    event.preventDefault(); setBusy(true)
    const data = { service_id: Number(serviceForm.service_id), price: serviceForm.price, duration_minutes: Number(serviceForm.duration_minutes), buffer_minutes: Number(serviceForm.buffer_minutes) }
    try {
      if (editingService) await patchManagedBranchService(editingService, data)
      else await createManagedBranchService(branchId, { ...data, is_active: true })
      setServiceForm(emptyService()); setEditingService(null); await load(); showSuccess('Đã lưu dịch vụ chi nhánh.')
    } catch (caught) { showError(caught, 'Không thể lưu dịch vụ.') }
    finally { setBusy(false) }
  }

  function editService(item: ManagedBranchService) { setEditingService(item.id_branch_service); setServiceForm({ service_id: String(item.service_id), price: item.price, duration_minutes: String(item.duration_minutes ?? 30), buffer_minutes: String(item.buffer_minutes ?? 0) }) }
  async function toggleService(item: ManagedBranchService) { try { await patchManagedBranchService(item.id_branch_service, { is_active: !item.is_active }); await load(); showSuccess('Đã cập nhật dịch vụ.') } catch (caught) { showError(caught, 'Không thể cập nhật dịch vụ.') } }

  async function saveHoliday(event: FormEvent) {
    event.preventDefault(); setBusy(true)
    const data = { branch_id: branchId, ...holidayForm }
    try {
      if (editingHoliday) await patchManagedHoliday(editingHoliday, data)
      else await createManagedHoliday(organizationId, data)
      setHolidayForm(emptyHoliday()); setEditingHoliday(null); await load(); showSuccess('Đã lưu ngày lễ/nghỉ.')
    } catch (caught) { showError(caught, 'Không thể lưu ngày lễ/nghỉ.') }
    finally { setBusy(false) }
  }

  function editHoliday(item: ManagedHoliday) { setEditingHoliday(item.id_holiday); setHolidayForm({ holiday_date: item.holiday_date, name: item.name, is_closed: item.is_closed }) }
  async function confirmDeleteHoliday() { if (!deletingHoliday) return; try { await deleteManagedHoliday(deletingHoliday.id_holiday); setDeletingHoliday(null); await load(); showSuccess('Đã xóa ngày lễ/nghỉ.') } catch (caught) { showError(caught, 'Không thể xóa ngày lễ/nghỉ.') } }

  if (!canAccessArea(user, 'MANAGEMENT') || !branchId) return <Navigate to="/quan-ly-chi-nhanh" replace />
  return <div className="branch-management-page branch-config-page">
    <ManagementPageHeader title="Cấu hình chi nhánh" path="/quan-ly-chi-nhanh/cau-hinh" />
    <main><div className="branch-management-main">
    <Link className="staff-schedule-back" to={`/quan-ly-chi-nhanh?chi-nhanh=${branchId}`}>← Quay lại quản lý chi nhánh</Link>
    <header className="branch-config-heading"><div><span>Thiết lập vận hành</span><h1>Cấu hình chi nhánh</h1><p>Quản lý khung giờ, nguồn lực và dịch vụ được sử dụng khi xếp lịch.</p></div><strong>4 nhóm cấu hình</strong></header>
    <ManagementSectionNav branchId={branchId} active="configuration" />
    {error && <div className="dentist-error" role="alert">{error}</div>}{notice && <div className="staff-schedule-notice" role="status">{notice}</div>}

    <div className="branch-config-grid">
      <section className="branch-management-schedule branch-config-section is-wide"><header><div><span>01</span><h2>Giờ mở cửa</h2></div><small>Lịch chuẩn 7 ngày</small></header><OpeningHoursEditor items={hours} canEdit={canEditOrganization} busy={busy} onChange={setHours} onSave={() => void saveHours()} /></section>
      <section className="branch-management-schedule branch-config-section"><header><div><span>02</span><h2>Ghế & phòng</h2></div><small>{chairs.filter((item) => item.is_active).length} đang dùng</small></header><form className="config-inline-form" onSubmit={saveChair}><label>Mã<input required value={chairForm.code} onChange={(event) => setChairForm({ ...chairForm, code: event.target.value })} /></label><label>Tên<input required value={chairForm.name} onChange={(event) => setChairForm({ ...chairForm, name: event.target.value })} /></label><label>Loại<select value={chairForm.resource_type} onChange={(event) => setChairForm({ ...chairForm, resource_type: event.target.value as 'CHAIR' | 'ROOM' })}><option value="CHAIR">Ghế nha khoa</option><option value="ROOM">Phòng</option></select></label><button disabled={busy}>{editingChair ? 'Lưu' : 'Thêm'}</button>{editingChair && <button type="button" className="button-secondary" onClick={() => { setEditingChair(null); setChairForm(emptyChair()) }}>Hủy</button>}</form><BranchChairList items={chairs} onEdit={editChair} onToggle={(item) => void toggleChair(item)} /></section>
      <section className="branch-management-schedule branch-config-section"><header><div><span>03</span><h2>Dịch vụ chi nhánh</h2></div><small>{services.filter((item) => item.is_active).length} dịch vụ</small></header><form className="config-inline-form service-form" onSubmit={saveService}><label>Dịch vụ<select required disabled={Boolean(editingService)} value={serviceForm.service_id} onChange={(event) => setServiceForm({ ...serviceForm, service_id: event.target.value })}><option value="">Chọn dịch vụ</option>{(editingService ? catalog.filter((item) => item.id_service === Number(serviceForm.service_id)) : availableServices).map((item) => <option key={item.id_service} value={item.id_service}>{item.name}</option>)}</select></label><label>Giá<input required min="0" type="number" value={serviceForm.price} onChange={(event) => setServiceForm({ ...serviceForm, price: event.target.value })} /></label><label>Phút<input required min="1" type="number" value={serviceForm.duration_minutes} onChange={(event) => setServiceForm({ ...serviceForm, duration_minutes: event.target.value })} /></label><label>Đệm<input required min="0" type="number" value={serviceForm.buffer_minutes} onChange={(event) => setServiceForm({ ...serviceForm, buffer_minutes: event.target.value })} /></label><button disabled={busy}>{editingService ? 'Lưu' : 'Thêm'}</button>{editingService && <button type="button" className="button-secondary" onClick={() => { setEditingService(null); setServiceForm(emptyService()) }}>Hủy</button>}</form><BranchServiceList items={services} onEdit={editService} onToggle={(item) => void toggleService(item)} /></section>
      <section className="branch-management-schedule branch-config-section is-wide"><header><div><span>04</span><h2>Ngày lễ & nghỉ</h2></div><small>{canEditOrganization ? 'Có thể chỉnh sửa' : 'Chỉ xem'}</small></header>{canEditOrganization && <form className="config-inline-form holiday-form" onSubmit={saveHoliday}><label>Ngày<input required type="date" value={holidayForm.holiday_date} onChange={(event) => setHolidayForm({ ...holidayForm, holiday_date: event.target.value })} /></label><label>Tên ngày nghỉ<input required value={holidayForm.name} onChange={(event) => setHolidayForm({ ...holidayForm, name: event.target.value })} /></label><label className="config-checkbox"><input type="checkbox" checked={holidayForm.is_closed} onChange={(event) => setHolidayForm({ ...holidayForm, is_closed: event.target.checked })} /> Đóng cửa</label><button disabled={busy}>{editingHoliday ? 'Lưu' : 'Thêm'}</button>{editingHoliday && <button type="button" className="button-secondary" onClick={() => { setEditingHoliday(null); setHolidayForm(emptyHoliday()) }}>Hủy</button>}</form>}<BranchHolidayList items={holidays} canEdit={canEditOrganization} onEdit={editHoliday} onDelete={setDeletingHoliday} /></section>
    </div>
  </div>{deletingHoliday && <div className="branch-management-modal-backdrop"><section className="branch-management-modal" role="dialog" aria-modal="true"><h2>Xóa ngày nghỉ?</h2><p>{deletingHoliday.name} — {deletingHoliday.holiday_date}</p><div><button type="button" className="button-secondary" onClick={() => setDeletingHoliday(null)}>Quay lại</button><button type="button" onClick={() => void confirmDeleteHoliday()}>Xác nhận xóa</button></div></section></div>}</main>
  </div>
}
