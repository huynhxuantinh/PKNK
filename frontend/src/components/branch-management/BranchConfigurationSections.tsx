import type { ManagedBranchService, ManagedChair, ManagedHoliday, ManagedOpeningHour } from '../../api/management'
import { weekdayLabels } from './staffSchedulePresentation'

export function OpeningHoursEditor({ items, canEdit, busy, onChange, onSave }: { items: ManagedOpeningHour[]; canEdit: boolean; busy: boolean; onChange: (items: ManagedOpeningHour[]) => void; onSave: () => void }) {
  const update = (index: number, changes: Partial<ManagedOpeningHour>) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item))
  return <div className="config-opening-hours">{items.map((item, index) => <div className="config-opening-row" key={item.weekday}>
    <strong>{weekdayLabels[item.weekday - 1]}</strong>
    <label className="config-closed-toggle"><input type="checkbox" checked={item.is_closed} disabled={!canEdit} onChange={(event) => update(index, { is_closed: event.target.checked, open_time: event.target.checked ? null : '08:00', close_time: event.target.checked ? null : '18:00' })} /> Nghỉ</label>
    <input aria-label={`Giờ mở ${weekdayLabels[item.weekday - 1]}`} type="time" disabled={!canEdit || item.is_closed} value={item.open_time?.slice(0, 5) ?? ''} onChange={(event) => update(index, { open_time: event.target.value })} />
    <span>đến</span>
    <input aria-label={`Giờ đóng ${weekdayLabels[item.weekday - 1]}`} type="time" disabled={!canEdit || item.is_closed} value={item.close_time?.slice(0, 5) ?? ''} onChange={(event) => update(index, { close_time: event.target.value })} />
  </div>)}{canEdit ? <button type="button" disabled={busy} onClick={onSave}>Lưu giờ mở cửa</button> : <p className="config-readonly-note">Chỉ quản trị viên tổng mới được thay đổi giờ mở cửa.</p>}</div>
}

export function BranchChairList({ items, onEdit, onToggle }: { items: ManagedChair[]; onEdit: (item: ManagedChair) => void; onToggle: (item: ManagedChair) => void }) {
  if (!items.length) return <div className="staff-schedule-empty">Chưa có ghế hoặc phòng.</div>
  return <div className="config-item-list">{items.map((item) => <article key={item.id_chair}><div><span className={item.is_active ? 'is-active' : ''}>{item.is_active ? 'Đang dùng' : 'Đã ngừng'}</span><h3>{item.name}</h3><p>{item.code} · {item.resource_type === 'CHAIR' ? 'Ghế nha khoa' : 'Phòng'}</p></div><div className="branch-management-actions"><button type="button" className="button-secondary" onClick={() => onEdit(item)}>Chỉnh sửa</button><button type="button" className="button-quiet" onClick={() => onToggle(item)}>{item.is_active ? 'Ngừng sử dụng' : 'Kích hoạt'}</button></div></article>)}</div>
}

export function BranchServiceList({ items, onEdit, onToggle }: { items: ManagedBranchService[]; onEdit: (item: ManagedBranchService) => void; onToggle: (item: ManagedBranchService) => void }) {
  if (!items.length) return <div className="staff-schedule-empty">Chưa có dịch vụ tại chi nhánh.</div>
  return <div className="config-item-list">{items.map((item) => <article key={item.id_branch_service}><div><span className={item.is_active ? 'is-active' : ''}>{item.is_active ? 'Đang cung cấp' : 'Đã ngừng'}</span><h3>{item.service_name}</h3><p>{new Intl.NumberFormat('vi-VN').format(Number(item.price))} ₫ · {item.duration_minutes ?? '—'} phút</p></div><div className="branch-management-actions"><button type="button" className="button-secondary" onClick={() => onEdit(item)}>Chỉnh sửa</button><button type="button" className="button-quiet" onClick={() => onToggle(item)}>{item.is_active ? 'Ngừng cung cấp' : 'Kích hoạt'}</button></div></article>)}</div>
}

export function BranchHolidayList({ items, canEdit, onEdit, onDelete }: { items: ManagedHoliday[]; canEdit: boolean; onEdit: (item: ManagedHoliday) => void; onDelete: (item: ManagedHoliday) => void }) {
  if (!items.length) return <div className="staff-schedule-empty">Chưa có ngày lễ/nghỉ.</div>
  return <div className="config-item-list">{items.map((item) => <article key={item.id_holiday}><div><span className={item.is_closed ? 'is-closed' : 'is-active'}>{item.is_closed ? 'Đóng cửa' : 'Mở cửa'}</span><h3>{item.name}</h3><p>{item.holiday_date} · {item.branch_id ? 'Riêng chi nhánh' : 'Toàn hệ thống'}</p></div>{canEdit && item.branch_id !== null && <div className="branch-management-actions"><button type="button" className="button-secondary" onClick={() => onEdit(item)}>Chỉnh sửa</button><button type="button" className="button-quiet" onClick={() => onDelete(item)}>Xóa</button></div>}</article>)}</div>
}
