import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { apiRequest } from '../api/client'
import { AuthBar } from '../auth/AuthBar'
import { useAuth } from '../auth/AuthContext'
import { displayGender, displayProfileValue } from '../features/profile/profileFormat'
import { Seo } from '../seo/Seo'
import type { AdministrativeOption, AdministrativeOptionsResponse, PatientProfileResponse } from '../types/api'

export function PatientProfilePage() {
  const { isAuthenticated, updateUser } = useAuth()
  const [profile, setProfile] = useState<PatientProfileResponse['data'] | null>(null)
  const [error, setError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState('')
  const [provinces, setProvinces] = useState<AdministrativeOption[]>([])
  const [wards, setWards] = useState<AdministrativeOption[]>([])
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    dateOfBirth: '',
    gender: '',
    provinceCode: '',
    wardCode: '',
    addressLine: '',
  })

  useEffect(() => {
    if (!isAuthenticated) return
    apiRequest<PatientProfileResponse>('/patients/me/', {}, { auth: true })
      .then((response) => {
        setProfile(response.data)
        setForm({
          fullName: response.data.full_name,
          phone: response.data.phone || '',
          dateOfBirth: response.data.date_of_birth || '',
          gender: response.data.gender || '',
          provinceCode: response.data.province_code || '',
          wardCode: response.data.ward_code || '',
          addressLine: response.data.address_line || '',
        })
      })
      .catch(() => setError('Không thể tải hồ sơ. Vui lòng thử lại.'))
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return
    apiRequest<AdministrativeOptionsResponse>('/branches/locations/provinces/')
      .then((response) => setProvinces(response.data))
      .catch(() => setFormError('Không thể tải danh sách tỉnh/thành.'))
  }, [isAuthenticated])

  useEffect(() => {
    if (!form.provinceCode) {
      setWards([])
      return
    }
    apiRequest<AdministrativeOptionsResponse>(`/branches/locations/wards/?province_code=${encodeURIComponent(form.provinceCode)}`)
      .then((response) => setWards(response.data))
      .catch(() => setFormError('Không thể tải danh sách phường/xã.'))
  }, [form.provinceCode])

  function resetForm() {
    if (!profile) return
    setForm({
      fullName: profile.full_name,
      phone: profile.phone || '',
      dateOfBirth: profile.date_of_birth || '',
      gender: profile.gender || '',
      provinceCode: profile.province_code || '',
      wardCode: profile.ward_code || '',
      addressLine: profile.address_line || '',
    })
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setFormError('')
    setMessage('')
    try {
      const response = await apiRequest<PatientProfileResponse>('/patients/me/', {
        method: 'PATCH',
        body: JSON.stringify({
          full_name: form.fullName.trim(),
          phone: form.phone || null,
          date_of_birth: form.dateOfBirth || null,
          gender: form.gender || null,
          province_code: form.provinceCode || null,
          ward_code: form.wardCode || null,
          address_line: form.addressLine.trim() || null,
        }),
      }, { auth: true })
      setProfile(response.data)
      updateUser({ full_name: response.data.full_name })
      setIsEditing(false)
      setMessage('Đã cập nhật hồ sơ.')
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Không thể cập nhật hồ sơ.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isAuthenticated) {
    return <Navigate to="/dang-nhap?returnTo=%2Fho-so" replace />
  }

  const address = profile
    ? [profile.address_line, profile.ward_name, profile.province_name].filter(Boolean).join(', ')
    : ''

  return (
    <div className="site-shell profile-page">
      <Seo title="Hồ sơ bệnh nhân | DentaVie" description="Thông tin hồ sơ bệnh nhân DentaVie." path="/ho-so" noIndex />
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Trang chủ DentaVie">
          <img src="/branding/dentavie-logo-horizontal-color.png" alt="DentaVie" />
        </Link>
        <nav className="main-nav" aria-label="Điều hướng chính">
          <Link to="/">Trang chủ</Link>
          <Link to="/dat-lich">Đặt lịch khám</Link>
          <Link to="/bang-gia">Bảng giá</Link>
        </nav>
        <AuthBar />
      </header>

      <main className="profile-main">
        <div className="profile-heading">
          <p className="eyebrow">Tài khoản của tôi</p>
          <h1>Hồ sơ bệnh nhân</h1>
          <p>Thông tin dùng khi đặt lịch và tiếp nhận tại phòng khám.</p>
        </div>

        {error ? <div className="profile-state">{error}</div> : !profile ? (
          <div className="profile-state">Đang tải hồ sơ...</div>
        ) : (
          <section className="profile-card" aria-label="Thông tin bệnh nhân">
            <div className="profile-card-title">
              <div className="profile-avatar" aria-hidden="true">{profile.full_name.trim().charAt(0).toUpperCase()}</div>
              <div className="profile-card-heading-copy">
                <h2>{profile.full_name}</h2>
                <p>{profile.email}</p>
              </div>
              {!isEditing && <button className="button button-quiet profile-edit-button" type="button" onClick={() => { setMessage(''); setIsEditing(true) }}>Chỉnh sửa</button>}
            </div>
            {isEditing ? (
              <form className="profile-edit-form" onSubmit={saveProfile}>
                <label>Họ và tên<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required /></label>
                <label>Số điện thoại<input type="tel" inputMode="tel" pattern="\+?[0-9]{9,15}" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value.replace(/[\s-]/g, '') })} placeholder="0901234567" /></label>
                <label>Ngày sinh<input type="date" max={new Date().toISOString().slice(0, 10)} value={form.dateOfBirth} onChange={(event) => setForm({ ...form, dateOfBirth: event.target.value })} /></label>
                <label>Giới tính<select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}><option value="">Chưa chọn</option><option value="MALE">Nam</option><option value="FEMALE">Nữ</option><option value="OTHER">Khác</option></select></label>
                <label>Tỉnh / Thành phố<select value={form.provinceCode} onChange={(event) => setForm({ ...form, provinceCode: event.target.value, wardCode: '' })}><option value="">Chọn tỉnh/thành</option>{provinces.map((item) => <option key={item.code} value={item.code}>{item.full_name}</option>)}</select></label>
                <label>Phường / Xã<select value={form.wardCode} onChange={(event) => setForm({ ...form, wardCode: event.target.value })} disabled={!form.provinceCode}><option value="">Chọn phường/xã</option>{wards.map((item) => <option key={item.code} value={item.code}>{item.full_name}</option>)}</select></label>
                <label className="profile-form-wide">Địa chỉ chi tiết<input value={form.addressLine} onChange={(event) => setForm({ ...form, addressLine: event.target.value })} placeholder="Số nhà, tên đường" /></label>
                {formError && <p className="profile-form-wide auth-page-error">{formError}</p>}
                <div className="profile-form-wide profile-actions">
                  <button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
                  <button className="button button-quiet" type="button" onClick={() => { resetForm(); setFormError(''); setIsEditing(false) }}>Hủy</button>
                </div>
              </form>
            ) : (
              <>
                {message && <p className="profile-success" role="status">{message}</p>}
                <dl className="profile-details">
                  <div><dt>Họ và tên</dt><dd>{displayProfileValue(profile.full_name)}</dd></div>
                  <div><dt>Số điện thoại</dt><dd>{displayProfileValue(profile.phone)}</dd></div>
                  <div><dt>Ngày sinh</dt><dd>{displayProfileValue(profile.date_of_birth)}</dd></div>
                  <div><dt>Giới tính</dt><dd>{displayGender(profile.gender)}</dd></div>
                  <div className="profile-detail-wide"><dt>Email</dt><dd>{profile.email}</dd></div>
                  <div className="profile-detail-wide"><dt>Địa chỉ</dt><dd>{displayProfileValue(address)}</dd></div>
                </dl>
                <div className="profile-actions">
                  <Link className="button button-quiet" to="/doi-mat-khau">Đổi mật khẩu</Link>
                  <Link className="button button-quiet profile-home-link" to="/">Về trang chủ</Link>
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
