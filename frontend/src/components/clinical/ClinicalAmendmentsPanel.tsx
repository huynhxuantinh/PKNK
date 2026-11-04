import { useEffect, useState, type FormEvent } from 'react'

import { createClinicalAmendment } from '../../api/dentist'
import type { ClinicalAmendment } from '../../types/api'

const amendmentDateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
})

interface ClinicalAmendmentsPanelProps {
  encounterId: number
  amendments: ClinicalAmendment[]
  canCreate: boolean
  onDirtyChange: (key: string, dirty: boolean) => void
  onCreated: (amendment: ClinicalAmendment) => void
}

export function ClinicalAmendmentsPanel({
  encounterId,
  amendments,
  canCreate,
  onDirtyChange,
  onCreated,
}: ClinicalAmendmentsPanelProps) {
  const [content, setContent] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    onDirtyChange('clinical-amendment:create', Boolean(content || reason))
  }, [content, onDirtyChange, reason])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await createClinicalAmendment(encounterId, {
        content: content.trim(),
        reason: reason.trim(),
      })
      onCreated(response.data)
      setContent('')
      setReason('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể bổ sung bệnh án.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="examination-history clinical-workflow-panel">
      <header>
        <div>
          <p className="eyebrow">Lịch sử chỉnh lý</p>
          <h2>Bổ sung bệnh án</h2>
        </div>
        <span>{amendments.length} bản bổ sung</span>
      </header>
      {error && <p className="app-error" role="alert">{error}</p>}
      {amendments.length === 0 ? (
        <p>Chưa có nội dung bổ sung.</p>
      ) : (
        <ol className="clinical-amendment-list">
          {amendments.map((amendment) => (
            <li key={amendment.id_clinical_amendment}>
              <div className="clinical-amendment-list__meta">
                <strong>{amendment.author_name}</strong>
                <time dateTime={amendment.created_at}>
                  {amendmentDateTime.format(new Date(amendment.created_at))}
                </time>
              </div>
              <p>{amendment.content}</p>
              <small>Lý do: {amendment.reason}</small>
            </li>
          ))}
        </ol>
      )}
      {canCreate && (
        <form className="clinical-amendment-form" onSubmit={submit}>
          <h3>Thêm nội dung bổ sung</h3>
          <label>
            Nội dung <b>*</b>
            <textarea required value={content} onChange={(event) => setContent(event.target.value)} />
          </label>
          <label>
            Lý do <b>*</b>
            <textarea required value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <button type="submit" disabled={busy || !content.trim() || !reason.trim()}>
            {busy ? 'Đang lưu...' : 'Lưu bổ sung'}
          </button>
        </form>
      )}
    </section>
  )
}
