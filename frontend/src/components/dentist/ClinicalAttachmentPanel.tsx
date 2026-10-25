import { useEffect, useState } from 'react'

import { deleteClinicalAttachment, uploadClinicalAttachment } from '../../api/dentist'
import type { ClinicalAttachment } from '../../types/api'
import { ConfirmationModal } from '../ConfirmationModal'
import { AuthenticatedThumbnail } from '../clinical/AuthenticatedThumbnail'

type AttachmentDraft = {
  id: string
  file: File
  kind: 'XRAY' | 'PHOTO'
  description: string
}

function ImagePreview({ file, alt }: { file: File; alt: string }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    const nextUrl = URL.createObjectURL(file)
    setUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [file])

  return url ? <img src={url} alt={alt} /> : <span>Đang tạo xem trước...</span>
}

type Props = {
  encounterId: number
  attachments: ClinicalAttachment[]
  disabled: boolean
  onChange: (attachments: ClinicalAttachment[]) => void
  onPendingChange: (count: number) => void
}

export function ClinicalAttachmentPanel({ encounterId, attachments, disabled, onChange, onPendingChange }: Props) {
  const [drafts, setDrafts] = useState<AttachmentDraft[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attachmentToRemove, setAttachmentToRemove] = useState<ClinicalAttachment | null>(null)

  useEffect(() => {
    onPendingChange(drafts.length)
  }, [drafts.length, onPendingChange])

  useEffect(() => () => onPendingChange(0), [onPendingChange])

  function selectFiles(files: FileList | null) {
    if (!files) return
    const accepted = Array.from(files).filter((file) => (
      ['image/jpeg', 'image/png'].includes(file.type) && file.size <= 15 * 1024 * 1024
    ))
    setDrafts((current) => [
      ...current,
      ...accepted.map((file) => ({
        id: crypto.randomUUID(),
        file,
        kind: 'PHOTO' as const,
        description: '',
      })),
    ])
    if (accepted.length !== files.length) {
      setError('Chỉ nhận ảnh JPG/PNG, tối đa 15 MB mỗi ảnh.')
    } else {
      setError('')
    }
  }

  function updateDraft(id: string, patch: Partial<Pick<AttachmentDraft, 'kind' | 'description'>>) {
    setDrafts((current) => current.map((draft) => (
      draft.id === id ? { ...draft, ...patch } : draft
    )))
  }

  async function uploadAll() {
    if (drafts.length === 0) return
    setBusy(true)
    setError('')
    try {
      let currentAttachments = [...attachments]
      let remainingDrafts = [...drafts]
      for (const draft of drafts) {
        const response = await uploadClinicalAttachment(encounterId, draft)
        currentAttachments = [...currentAttachments, response.data]
        remainingDrafts = remainingDrafts.filter((item) => item.id !== draft.id)
        onChange(currentAttachments)
        setDrafts(remainingDrafts)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải ảnh lên.')
    } finally {
      setBusy(false)
    }
  }

  async function removeAttachment(attachment: ClinicalAttachment) {
    setAttachmentToRemove(null)
    setBusy(true)
    setError('')
    try {
      await deleteClinicalAttachment(attachment.id_clinical_attachment)
      onChange(attachments.filter((item) => (
        item.id_clinical_attachment !== attachment.id_clinical_attachment
      )))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể xóa ảnh.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="clinical-attachments" aria-labelledby="clinical-attachments-title">
      <header>
        <div><p className="eyebrow">Hình ảnh bệnh án</p><h2 id="clinical-attachments-title">Ảnh và phim chụp</h2></div>
        <span>{attachments.length} ảnh đã lưu</span>
      </header>

      {error && <div className="dentist-error" role="alert">{error}</div>}

      {attachments.length > 0 && <div className="clinical-attachment-grid">
        {attachments.filter((item) => item.content_type.startsWith('image/')).map((attachment) => (
          <article className="clinical-attachment-card" key={attachment.id_clinical_attachment}>
            <div className="clinical-attachment-preview"><AuthenticatedThumbnail attachment={attachment} /></div>
            <div><strong>{attachment.kind === 'XRAY' ? 'Phim X-quang' : 'Ảnh lâm sàng'}</strong><p>{attachment.description || 'Không có mô tả'}</p></div>
            {!disabled && <button type="button" disabled={busy} onClick={() => setAttachmentToRemove(attachment)}>Xóa</button>}
          </article>
        ))}
      </div>}

      {!disabled && <>
        <label className="clinical-upload-picker">
          <input type="file" accept="image/jpeg,image/png" multiple onChange={(event) => { selectFiles(event.target.files); event.target.value = '' }} />
          <span>+ Chọn nhiều ảnh</span>
          <small>JPG hoặc PNG, tối đa 15 MB mỗi ảnh</small>
        </label>

        {drafts.length > 0 && <div className="clinical-upload-drafts">
          {drafts.map((draft) => (
            <article key={draft.id}>
              <div className="clinical-attachment-preview"><ImagePreview file={draft.file} alt="Ảnh đang chờ tải lên" /></div>
              <div className="clinical-upload-fields">
                <label>Loại ảnh<select value={draft.kind} onChange={(event) => updateDraft(draft.id, { kind: event.target.value as AttachmentDraft['kind'] })}><option value="PHOTO">Ảnh lâm sàng</option><option value="XRAY">Phim X-quang</option></select></label>
                <label>Mô tả<input value={draft.description} maxLength={255} onChange={(event) => updateDraft(draft.id, { description: event.target.value })} placeholder="Ví dụ: Răng số 7 trước điều trị" /></label>
              </div>
              <button type="button" disabled={busy} onClick={() => setDrafts((current) => current.filter((item) => item.id !== draft.id))}>Bỏ ảnh</button>
            </article>
          ))}
          <button type="button" className="clinical-upload-submit" disabled={busy} onClick={uploadAll}>{busy ? 'Đang tải ảnh...' : `Tải lên ${drafts.length} ảnh`}</button>
        </div>}
      </>}
      {attachmentToRemove && (
        <ConfirmationModal
          title="Xóa ảnh khỏi bệnh án?"
          description="Ảnh đã xóa sẽ không còn hiển thị trong hồ sơ khám."
          confirmLabel="Xóa ảnh"
          danger
          busy={busy}
          onCancel={() => setAttachmentToRemove(null)}
          onConfirm={() => void removeAttachment(attachmentToRemove)}
        />
      )}
    </section>
  )
}
