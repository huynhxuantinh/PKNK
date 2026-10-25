import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import {
  createClinicalEncounter,
  finalizeAndCompleteDentistAppointment,
  getClinicalEncounter,
  getDentistAppointment,
  getDentistPatientSummary,
  updateClinicalEncounter,
} from '../api/dentist'
import { AuthBar } from '../auth/AuthBar'
import { useAuth } from '../auth/AuthContext'
import { hasActiveRole } from '../auth/roles'
import { ConfirmationModal } from '../components/ConfirmationModal'
import { ClinicalAttachmentPanel } from '../components/dentist/ClinicalAttachmentPanel'
import {
  clearClinicalDraft,
  clinicalFormsEqual,
  readClinicalDraft,
  writeClinicalDraft,
} from '../features/dentist/clinicalDraft'
import { Seo } from '../seo/Seo'
import type { ClinicalEncounter, DentistAppointment, DentistPatientSummary } from '../types/api'

type ClinicalForm = Pick<ClinicalEncounter, 'chief_complaint' | 'medical_history' | 'diagnosis_summary' | 'notes' | 'aftercare_instructions'>

const emptyForm: ClinicalForm = { chief_complaint: '', medical_history: '', diagnosis_summary: '', notes: '', aftercare_instructions: '' }

function formFromEncounter(encounter: ClinicalEncounter): ClinicalForm {
  return {
    chief_complaint: encounter.chief_complaint,
    medical_history: encounter.medical_history,
    diagnosis_summary: encounter.diagnosis_summary,
    notes: encounter.notes,
    aftercare_instructions: encounter.aftercare_instructions,
  }
}

function ReadOnlyClinicalField({ label, value }: { label: string; value: string }) {
  return (
    <div className="examination-readonly-field">
      <span>{label}</span>
      <p>{value.trim() || 'Chưa ghi nhận.'}</p>
    </div>
  )
}

function patientGenderLabel(gender: string) {
  return ({ MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' } as Record<string, string>)[gender] || 'Chưa cập nhật'
}

function patientDate(value: string | null) {
  if (!value) return 'Chưa cập nhật'
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium' }).format(new Date(`${value}T00:00:00+07:00`))
}

export function DentistExaminationPage() {
  const { publicCode = '' } = useParams()
  const { isAuthenticated, user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [appointment, setAppointment] = useState<DentistAppointment | null>(null)
  const [encounter, setEncounter] = useState<ClinicalEncounter | null>(null)
  const [patientSummary, setPatientSummary] = useState<DentistPatientSummary | null>(null)
  const [patientSummaryError, setPatientSummaryError] = useState('')
  const [form, setForm] = useState<ClinicalForm>(emptyForm)
  const [serverForm, setServerForm] = useState<ClinicalForm | null>(null)
  const [draftReadyFor, setDraftReadyFor] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showCompleteConfirmation, setShowCompleteConfirmation] = useState(false)
  const redirectTimerRef = useRef<number | null>(null)
  const encounterCreationRef = useRef<{
    publicCode: string
    request: ReturnType<typeof createClinicalEncounter>
  } | null>(null)

  const branchId = Number(searchParams.get('chi-nhanh')) || null
  const currentUserId = user?.id_user
  const isDentist = hasActiveRole(user, ['DENTIST'])
  const isDirty = Boolean(
    encounter?.status !== 'FINALIZED'
    && appointment?.status !== 'COMPLETED'
    && serverForm
    && !clinicalFormsEqual(form, serverForm),
  )
  const navigationBlocker = useBlocker(isDirty)

  useEffect(() => () => {
    if (redirectTimerRef.current !== null) window.clearTimeout(redirectTimerRef.current)
  }, [])

  useEffect(() => {
    if (!isDirty) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    if (!currentUserId || !publicCode || draftReadyFor !== publicCode || !serverForm) return
    if (isDirty) writeClinicalDraft(sessionStorage, currentUserId, publicCode, form)
    else clearClinicalDraft(sessionStorage, currentUserId, publicCode)
  }, [currentUserId, draftReadyFor, form, isDirty, publicCode, serverForm])

  useEffect(() => {
    if (!isAuthenticated || !publicCode) return
    let active = true
    setDraftReadyFor('')

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
        const latestServerForm = formFromEncounter(encounterResponse.data)
        const localDraft = currentUserId && encounterResponse.data.status === 'DRAFT' && appointmentResponse.data.status !== 'COMPLETED'
          ? readClinicalDraft(sessionStorage, currentUserId, publicCode)
          : null
        setServerForm(latestServerForm)
        setForm(localDraft ?? latestServerForm)
        setDraftReadyFor(publicCode)
        if (localDraft && !clinicalFormsEqual(localDraft, latestServerForm)) {
          setNotice('Đã khôi phục bản nháp lưu trên thiết bị.')
        }
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Không thể mở lượt khám.')
      })
    return () => { active = false }
  }, [currentUserId, isAuthenticated, publicCode])

  useEffect(() => {
    if (!appointment || !['IN_PROGRESS', 'COMPLETED'].includes(appointment.status)) return
    let active = true
    setPatientSummary(null)
    setPatientSummaryError('')
    getDentistPatientSummary(appointment.patient_profile_id, appointment.public_code)
      .then((response) => {
        if (active) setPatientSummary(response.data)
      })
      .catch((reason) => {
        if (active) setPatientSummaryError(reason instanceof Error ? reason.message : 'Không thể tải hồ sơ người bệnh.')
      })
    return () => { active = false }
  }, [appointment])

  async function saveDraft() {
    if (!encounter) return
    setIsSaving(true)
    setError('')
    try {
      const response = await updateClinicalEncounter(encounter.id_clinical_encounter, form)
      setEncounter(response.data)
      const savedForm = formFromEncounter(response.data)
      setForm(savedForm)
      setServerForm(savedForm)
      if (currentUserId) clearClinicalDraft(sessionStorage, currentUserId, publicCode)
      setNotice('Đã lưu bệnh án nháp.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lưu bệnh án.')
    } finally {
      setIsSaving(false)
    }
  }

  function requestFinalizeAndComplete() {
    if (!encounter) return
    if (encounter.status !== 'FINALIZED' && !form.diagnosis_summary.trim()) {
      setError('Cần nhập chẩn đoán trước khi hoàn tất lượt khám.')
      return
    }
    setShowCompleteConfirmation(true)
  }

  async function finalizeAndComplete() {
    if (!encounter) return
    setShowCompleteConfirmation(false)
    setIsSaving(true)
    setError('')
    try {
      const response = await finalizeAndCompleteDentistAppointment(publicCode, form)
      setEncounter(response.data.encounter)
      setAppointment(response.data.appointment)
      setServerForm(formFromEncounter(response.data.encounter))
      if (currentUserId) clearClinicalDraft(sessionStorage, currentUserId, publicCode)
      setNotice('Đã hoàn tất lượt khám.')
      redirectTimerRef.current = window.setTimeout(() => {
        navigate(branchId ? `/bac-si?chi-nhanh=${branchId}` : '/bac-si')
      }, 900)
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
  const isReadOnly = isFinalized || appointment?.status === 'COMPLETED'

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
              <div><p className="eyebrow">{isReadOnly ? 'Lượt khám đã hoàn tất' : 'Lượt khám đang diễn ra'}</p><h1>{contactName}</h1><p>{appointment.service_name_snapshot} · {appointment.branch_name}</p></div>
              <dl><div><dt>Số điện thoại</dt><dd>{contactPhone}</dd></div><div><dt>Email</dt><dd>{appointment.contact_email_snapshot || 'Chưa cập nhật'}</dd></div><div><dt>Giờ hẹn</dt><dd>{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(appointment.starts_at))}</dd></div></dl>
            </section>
            <section className="examination-layout">
              <div className="examination-form-card">
                <header><div><p className="eyebrow">Bệnh án điện tử</p><h2>{isReadOnly ? 'Bệnh án đã chốt' : 'Ghi nhận khám'}</h2></div><span>{isReadOnly ? 'Chỉ đọc' : 'Bản nháp'}</span></header>
                {isReadOnly ? (
                  <div className="examination-readonly-fields">
                    <ReadOnlyClinicalField label="Lý do khám" value={form.chief_complaint} />
                    <ReadOnlyClinicalField label="Tiền sử sức khỏe" value={form.medical_history} />
                    <ReadOnlyClinicalField label="Chẩn đoán" value={form.diagnosis_summary} />
                    <ReadOnlyClinicalField label="Ghi chú nội bộ" value={form.notes} />
                    <ReadOnlyClinicalField label="Dặn dò sau khám" value={form.aftercare_instructions} />
                  </div>
                ) : <>
                  <label>Lý do khám<textarea value={form.chief_complaint} onChange={(event) => setForm({ ...form, chief_complaint: event.target.value })} placeholder="Ví dụ: đau răng số 7, ê buốt khi ăn..." /></label>
                  <label>Tiền sử sức khỏe<textarea value={form.medical_history} onChange={(event) => setForm({ ...form, medical_history: event.target.value })} placeholder="Dị ứng thuốc, bệnh nền hoặc thông tin cần lưu ý" /></label>
                  <label>Chẩn đoán <b>*</b><textarea value={form.diagnosis_summary} onChange={(event) => setForm({ ...form, diagnosis_summary: event.target.value })} placeholder="Tóm tắt chẩn đoán sau khi khám" required /></label>
                  <label>Ghi chú nội bộ<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Ghi chú chuyên môn chỉ dành cho nhân viên y tế" /></label>
                  <label>Dặn dò sau khám<textarea value={form.aftercare_instructions} onChange={(event) => setForm({ ...form, aftercare_instructions: event.target.value })} placeholder="Hướng dẫn chăm sóc để người bệnh xem trong hồ sơ" /></label>
                </>}
                {appointment.status !== 'COMPLETED' && (
                  <footer>
                    {isDirty && <span className="examination-local-draft">Đã lưu nháp trên thiết bị</span>}
                    {!isFinalized && <button type="button" className="examination-save" disabled={isSaving} onClick={saveDraft}>Lưu nháp</button>}
                    <button type="button" className="examination-complete" disabled={isSaving} onClick={requestFinalizeAndComplete}>
                      {isSaving ? 'Đang xử lý...' : isFinalized ? 'Hoàn tất lượt khám' : 'Chốt & hoàn tất khám'}
                    </button>
                  </footer>
                )}
              </div>
              <aside className="examination-summary"><p className="eyebrow">Thông tin đặt khám</p><h2>Ghi chú người bệnh</h2><p>{appointment.patient_note || 'Không có ghi chú thêm từ người đặt.'}</p><hr /><span>Mã lịch hẹn</span><strong>{appointment.public_code}</strong><span>Ghế khám</span><strong>{appointment.chair_name}</strong></aside>
            </section>
            <section className="examination-history" aria-labelledby="patient-history-title">
              <header>
                <div><p className="eyebrow">Hồ sơ người bệnh</p><h2 id="patient-history-title">Thông tin và lịch sử khám</h2></div>
                <span>Chỉ xem tại chi nhánh này</span>
              </header>
              {patientSummaryError ? <div className="dentist-error" role="alert">{patientSummaryError}</div> : !patientSummary ? (
                <div className="examination-history-loading">Đang tải hồ sơ người bệnh...</div>
              ) : <>
                <dl className="examination-profile-summary">
                  <div><dt>Họ và tên</dt><dd>{patientSummary.full_name}</dd></div>
                  <div><dt>Ngày sinh</dt><dd>{patientDate(patientSummary.date_of_birth)}</dd></div>
                  <div><dt>Giới tính</dt><dd>{patientGenderLabel(patientSummary.gender)}</dd></div>
                  <div><dt>Số điện thoại</dt><dd>{patientSummary.phone || 'Chưa cập nhật'}</dd></div>
                </dl>
                <div className="examination-history-list">
                  {patientSummary.clinical_history.length === 0 ? (
                    <p className="examination-history-empty">Chưa có bệnh án đã chốt tại chi nhánh này.</p>
                  ) : patientSummary.clinical_history.map((item) => (
                    <article key={item.id_clinical_encounter}>
                      <header>
                        <div><strong>{item.service_name}</strong><span>{item.branch_name} · {item.dentist_name}</span></div>
                        <time dateTime={item.finalized_at}>{patientDate(item.finalized_at.slice(0, 10))}</time>
                      </header>
                      <dl>
                        <div><dt>Lý do khám</dt><dd>{item.chief_complaint || 'Chưa ghi nhận'}</dd></div>
                        <div><dt>Chẩn đoán</dt><dd>{item.diagnosis_summary || 'Chưa ghi nhận'}</dd></div>
                        {item.aftercare_instructions && <div><dt>Dặn dò</dt><dd>{item.aftercare_instructions}</dd></div>}
                      </dl>
                    </article>
                  ))}
                </div>
              </>}
            </section>
            <ClinicalAttachmentPanel
              encounterId={encounter.id_clinical_encounter}
              attachments={encounter.attachments}
              disabled={isReadOnly}
              onChange={(attachments) => setEncounter((current) => (
                current ? { ...current, attachments } : current
              ))}
            />
            {showCompleteConfirmation && (
              <ConfirmationModal
                title={isFinalized ? 'Hoàn tất lượt khám?' : 'Chốt bệnh án và hoàn tất?'}
                description={isFinalized
                  ? 'Lượt khám sẽ được chuyển sang trạng thái đã hoàn tất.'
                  : 'Sau khi chốt, bệnh án sẽ không thể chỉnh sửa trực tiếp.'}
                confirmLabel={isFinalized ? 'Hoàn tất khám' : 'Chốt & hoàn tất'}
                busy={isSaving}
                onCancel={() => setShowCompleteConfirmation(false)}
                onConfirm={() => void finalizeAndComplete()}
              />
            )}
            {navigationBlocker.state === 'blocked' && (
              <ConfirmationModal
                title="Rời trang khi chưa lưu?"
                description="Các thay đổi chưa được lưu lên hệ thống. Bản nháp vẫn được giữ trên thiết bị này trong 24 giờ."
                confirmLabel="Rời trang"
                danger
                onCancel={() => navigationBlocker.reset()}
                onConfirm={() => navigationBlocker.proceed()}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}
