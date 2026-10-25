import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import {
  createClinicalEncounter,
  finalizeAndCompleteDentistAppointment,
  getClinicalEncounter,
  getDentistAppointment,
  updateClinicalEncounter,
} from '../api/dentist'
import { AuthBar } from '../auth/AuthBar'
import { useAuth } from '../auth/AuthContext'
import { Seo } from '../seo/Seo'
import type { ClinicalEncounter, DentistAppointment } from '../types/api'

type ClinicalForm = Pick<ClinicalEncounter, 'chief_complaint' | 'medical_history' | 'diagnosis_summary' | 'notes'>

const emptyForm: ClinicalForm = { chief_complaint: '', medical_history: '', diagnosis_summary: '', notes: '' }

export function DentistExaminationPage() {
  const { publicCode = '' } = useParams()
  const { isAuthenticated, user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [appointment, setAppointment] = useState<DentistAppointment | null>(null)
  const [encounter, setEncounter] = useState<ClinicalEncounter | null>(null)
  const [form, setForm] = useState<ClinicalForm>(emptyForm)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const encounterCreationRef = useRef<{
    publicCode: string
    request: ReturnType<typeof createClinicalEncounter>
  } | null>(null)

  const branchId = Number(searchParams.get('chi-nhanh')) || null
  const isDentist = user?.memberships?.some((membership) => membership.role === 'DENTIST')

  useEffect(() => {
    if (!isAuthenticated || !publicCode) return
    let active = true

    const loadEncounter = async () => {
      try {
        return await getClinicalEncounter(publicCode)
      } catch (reason) {
        if (!(reason instanceof ApiError) || reason.status !== 404) throw reason

        if (encounterCreationRef.current?.publicCode !== publicCode) {
          const request = createClinicalEncounter(publicCode).catch((createReason) => {
            if (createReason instanceof ApiError && createReason.status === 409) {
              return getClinicalEncounter(publicCode)
            }
            throw createReason
          })
          encounterCreationRef.current = { publicCode, request }
        }

        return encounterCreationRef.current.request
      }
    }

    Promise.all([
      getDentistAppointment(publicCode),
      loadEncounter(),
    ])
      .then(([appointmentResponse, encounterResponse]) => {
        if (!active) return
        setAppointment(appointmentResponse.data)
        setEncounter(encounterResponse.data)
        setForm({
          chief_complaint: encounterResponse.data.chief_complaint,
          medical_history: encounterResponse.data.medical_history,
          diagnosis_summary: encounterResponse.data.diagnosis_summary,
          notes: encounterResponse.data.notes,
        })
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Không thể mở lượt khám.')
      })
    return () => { active = false }
  }, [isAuthenticated, publicCode])

  async function saveDraft() {
    if (!encounter) return
    setIsSaving(true)
    setError('')
    try {
      const response = await updateClinicalEncounter(encounter.id_clinical_encounter, form)
      setEncounter(response.data)
      setNotice('Đã lưu bệnh án nháp.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lưu bệnh án.')
    } finally {
      setIsSaving(false)
    }
  }

  async function finalizeAndComplete() {
    if (!encounter) return
    const alreadyFinalized = encounter.status === 'FINALIZED'
    if (!alreadyFinalized && !form.diagnosis_summary.trim()) {
      setError('Cần nhập chẩn đoán trước khi hoàn tất lượt khám.')
      return
    }
    const confirmation = alreadyFinalized
      ? 'Hoàn tất lượt khám này?'
      : 'Chốt bệnh án và hoàn tất lượt khám này? Sau khi chốt sẽ không thể sửa trực tiếp.'
    if (!window.confirm(confirmation)) return
    setIsSaving(true)
    setError('')
    try {
      const response = await finalizeAndCompleteDentistAppointment(publicCode, form)
      setEncounter(response.data.encounter)
      setAppointment(response.data.appointment)
      setNotice('Đã hoàn tất lượt khám.')
      window.setTimeout(() => navigate(branchId ? `/bac-si?chi-nhanh=${branchId}` : '/bac-si'), 900)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể hoàn tất lượt khám.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isAuthenticated) return <Navigate to={`/dang-nhap?returnTo=${encodeURIComponent(`/bac-si/kham/${publicCode}`)}`} replace />
  if (!isDentist) return <Navigate to="/" replace />

  const contactName = appointment?.contact_name_snapshot || appointment?.patient_name || 'Đang tải'
  const contactPhone = appointment?.contact_phone_snapshot || appointment?.patient_phone || 'Chưa cập nhật'
  const isFinalized = encounter?.status === 'FINALIZED'

  return (
    <div className="dentist-page examination-page">
      <Seo title="Khám bệnh | DentaVie" description="Bệnh án điện tử dành cho nha sĩ." path={`/bac-si/kham/${publicCode}`} noIndex />
      <header className="dentist-header">
        <Link className="brand" to="/" aria-label="DentaVie"><img src="/branding/dentavie-logo-horizontal-color.png" alt="DentaVie" /></Link>
        <div className="dentist-header-context"><span>Phiên khám</span><strong>Nha sĩ</strong></div>
        <AuthBar />
      </header>
      <main className="examination-main">
        <Link className="examination-back" to={branchId ? `/bac-si?chi-nhanh=${branchId}` : '/bac-si'}>← Quay lại lịch khám</Link>
        {error && <div className="dentist-error" role="alert">{error}</div>}
        {notice && <div className="examination-notice" role="status">{notice}</div>}
        {!appointment || !encounter ? <div className="examination-loading">Đang mở bệnh án...</div> : (
          <>
            <section className="examination-patient">
              <div><p className="eyebrow">Lượt khám đang diễn ra</p><h1>{contactName}</h1><p>{appointment.service_name_snapshot} · {appointment.branch_name}</p></div>
              <dl><div><dt>Số điện thoại</dt><dd>{contactPhone}</dd></div><div><dt>Email</dt><dd>{appointment.contact_email_snapshot || 'Chưa cập nhật'}</dd></div><div><dt>Giờ hẹn</dt><dd>{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(appointment.starts_at))}</dd></div></dl>
            </section>
            <section className="examination-layout">
              <div className="examination-form-card">
                <header><div><p className="eyebrow">Bệnh án điện tử</p><h2>{isFinalized ? 'Bệnh án đã chốt' : 'Ghi nhận khám'}</h2></div><span>{isFinalized ? 'Đã chốt' : 'Bản nháp'}</span></header>
                <label>Lý do khám<textarea value={form.chief_complaint} disabled={isFinalized} onChange={(event) => setForm({ ...form, chief_complaint: event.target.value })} placeholder="Ví dụ: đau răng số 7, ê buốt khi ăn..." /></label>
                <label>Tiền sử sức khỏe<textarea value={form.medical_history} disabled={isFinalized} onChange={(event) => setForm({ ...form, medical_history: event.target.value })} placeholder="Dị ứng thuốc, bệnh nền hoặc thông tin cần lưu ý" /></label>
                <label>Chẩn đoán <b>*</b><textarea value={form.diagnosis_summary} disabled={isFinalized} onChange={(event) => setForm({ ...form, diagnosis_summary: event.target.value })} placeholder="Tóm tắt chẩn đoán sau khi khám" required /></label>
                <label>Ghi chú điều trị<textarea value={form.notes} disabled={isFinalized} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Hướng dẫn, kế hoạch theo dõi hoặc chỉ định tiếp theo" /></label>
                {appointment.status !== 'COMPLETED' && (
                  <footer>
                    {!isFinalized && <button type="button" className="examination-save" disabled={isSaving} onClick={saveDraft}>Lưu nháp</button>}
                    <button type="button" className="examination-complete" disabled={isSaving} onClick={finalizeAndComplete}>
                      {isSaving ? 'Đang xử lý...' : isFinalized ? 'Hoàn tất lượt khám' : 'Chốt & hoàn tất khám'}
                    </button>
                  </footer>
                )}
              </div>
              <aside className="examination-summary"><p className="eyebrow">Thông tin đặt khám</p><h2>Ghi chú người bệnh</h2><p>{appointment.patient_note || 'Không có ghi chú thêm từ người đặt.'}</p><hr /><span>Mã lịch hẹn</span><strong>{appointment.public_code}</strong><span>Ghế khám</span><strong>{appointment.chair_name}</strong></aside>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
