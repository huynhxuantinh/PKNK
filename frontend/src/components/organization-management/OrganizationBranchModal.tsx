import type { FormEvent } from 'react'

import type { OrganizationBranch } from '../../api/organization'
import type { AdministrativeOption } from '../../types/api'
import type { BranchFormState } from '../../features/organization/organizationValidation'

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
            <h2 id="organization-branch-modal-title">
              {branch ? 'Sửa chi nhánh' : 'Thêm chi nhánh'}
            </h2>
          </div>
          <button type="button" className="organization-modal-close" disabled={busy} onClick={onClose}>
            Đóng
          </button>
        </header>

        {error && <div className="dentist-error" role="alert">{error}</div>}

        <form className="organization-form-grid" onSubmit={submit}>
          <label>
            Mã chi nhánh
            <input
              required
              value={form.code}
              onChange={(event) => onChange({ code: event.target.value })}
            />
          </label>
          <label>
            Tên chi nhánh
            <input
              required
              value={form.name}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </label>
          <label>
            Điện thoại
            <input
              value={form.phone}
              onChange={(event) => onChange({ phone: event.target.value })}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => onChange({ email: event.target.value })}
            />
          </label>
          <label>
            Tỉnh/thành
            <select
              required
              value={form.provinceCode}
              onChange={(event) => onProvinceChange(event.target.value)}
            >
              <option value="">Chọn tỉnh/thành</option>
              {provinces.map((province) => (
                <option key={province.code} value={province.code}>
                  {province.full_name}
                </option>
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
              <option value="">
                {loadingWards ? 'Đang tải phường/xã...' : 'Chọn phường/xã'}
              </option>
              {wards.map((ward) => (
                <option key={ward.code} value={ward.code}>
                  {ward.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="organization-span-2">
            Địa chỉ
            <input
              required
              value={form.addressLine}
              onChange={(event) => onChange({ addressLine: event.target.value })}
            />
          </label>
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
          <p className="organization-hint organization-span-2">
            Nhập cả vĩ độ và kinh độ. Có thể lấy tọa độ bằng cách chuột phải vào vị trí
            trên Google Maps và sao chép cặp số hiển thị.
          </p>
          <label className="organization-checkbox organization-span-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => onChange({ isActive: event.target.checked })}
            />
            Chi nhánh đang hoạt động
          </label>

          <div className="organization-modal-actions organization-span-2">
            <button type="button" className="button-secondary" disabled={busy} onClick={onClose}>
              Hủy
            </button>
            <button type="submit" disabled={busy}>
              {busy ? 'Đang lưu...' : branch ? 'Lưu thay đổi' : 'Tạo chi nhánh'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
