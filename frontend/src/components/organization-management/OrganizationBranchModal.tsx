import type { FormEvent } from 'react'

import type { OrganizationBranch } from '../../api/organization'
import {
  coordinateWarning,
  parseCoordinates,
  type BranchFormState,
} from '../../features/organization/organizationValidation'
import type { AdministrativeOption } from '../../types/api'
import { LocationPicker } from './LocationPicker'

interface OrganizationBranchModalProps {
  branch: OrganizationBranch | null
  form: BranchFormState
  provinces: AdministrativeOption[]
  wards: AdministrativeOption[]
  loadingWards: boolean
  busy: boolean
  error: string
  onChange: (changes: Partial<BranchFormState>) => void
  onProvinceChange: (provinceCode: string) => void
  onClose: () => void
  onSubmit: () => void
}

export function OrganizationBranchModal({
  branch,
  form,
  provinces,
  wards,
  loadingWards,
  busy,
  error,
  onChange,
  onProvinceChange,
  onClose,
  onSubmit,
}: OrganizationBranchModalProps) {
  const coordinates = parseCoordinates(form.latitude, form.longitude)
  const locationWarning = coordinateWarning(form.latitude, form.longitude)
  const provinceName = provinces.find((province) => province.code === form.provinceCode)?.full_name
  const wardName = wards.find((ward) => ward.code === form.wardCode)?.full_name
  const searchQuery = [form.addressLine, wardName, provinceName].filter(Boolean).join(', ')

  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <div
      className="branch-management-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        className="branch-management-modal organization-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="organization-branch-modal-title"
      >
        <header>
          <div>
            <span className="branch-report-eyebrow">CHI NHÁNH</span>
            <h2 id="organization-branch-modal-title">{branch ? 'Sửa chi nhánh' : 'Thêm chi nhánh'}</h2>
          </div>
          <button type="button" className="organization-modal-close" disabled={busy} onClick={onClose}>Đóng</button>
        </header>

        {error && <div className="dentist-error" role="alert">{error}</div>}

        <form className="organization-form-grid" onSubmit={submit}>
          <label>
            Mã chi nhánh
            <input required value={form.code} onChange={(event) => onChange({ code: event.target.value })} />
          </label>
          <label>
            Tên chi nhánh
            <input required value={form.name} onChange={(event) => onChange({ name: event.target.value })} />
          </label>
          <label>
            Điện thoại
            <input value={form.phone} onChange={(event) => onChange({ phone: event.target.value })} />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={(event) => onChange({ email: event.target.value })} />
          </label>
          <label>
            Tỉnh/thành
            <select required value={form.provinceCode} onChange={(event) => onProvinceChange(event.target.value)}>
              <option value="">Chọn tỉnh/thành</option>
              {provinces.map((province) => (
                <option key={province.code} value={province.code}>{province.full_name}</option>
              ))}
            </select>
          </label>
          <label>
            Phường/xã
            <select
              required
              value={form.wardCode}
              disabled={!form.provinceCode || loadingWards}
              onChange={(event) => onChange({ wardCode: event.target.value })}
            >
              <option value="">{loadingWards ? 'Đang tải phường/xã...' : 'Chọn phường/xã'}</option>
              {wards.map((ward) => (
                <option key={ward.code} value={ward.code}>{ward.full_name}</option>
              ))}
            </select>
          </label>
          <label className="organization-span-2">
            Địa chỉ
            <input required value={form.addressLine} onChange={(event) => onChange({ addressLine: event.target.value })} />
          </label>

          <section className="organization-location-field organization-span-2">
            <div className="organization-location-heading">
              <strong>Vị trí trên bản đồ</strong>
              <p>Kéo ghim, bấm lên bản đồ, tìm địa chỉ hoặc nhập tọa độ.</p>
            </div>
            <LocationPicker
              value={coordinates}
              disabled={busy}
              defaultSearchQuery={searchQuery}
              onChange={(latitude, longitude) => {
                onChange({
                  latitude: latitude === null ? '' : latitude.toFixed(6),
                  longitude: longitude === null ? '' : longitude.toFixed(6),
                })
              }}
            />
            <div className="organization-coordinate-grid">
              <label>
                Vĩ độ
                <input
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  value={form.latitude}
                  onChange={(event) => onChange({ latitude: event.target.value })}
                />
              </label>
              <label>
                Kinh độ
                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  value={form.longitude}
                  onChange={(event) => onChange({ longitude: event.target.value })}
                />
              </label>
            </div>
            {locationWarning && <p className="organization-warning" role="status">{locationWarning}</p>}
          </section>

          <label className="organization-checkbox organization-span-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => onChange({ isActive: event.target.checked })}
            />
            Chi nhánh đang hoạt động
          </label>

          <div className="organization-modal-actions organization-span-2">
            <button type="button" className="button-secondary" disabled={busy} onClick={onClose}>Hủy</button>
            <button type="submit" disabled={busy}>{busy ? 'Đang lưu...' : branch ? 'Lưu thay đổi' : 'Tạo chi nhánh'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
