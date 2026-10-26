import { useEffect, useRef, useState } from 'react'

import { authenticatedFileBlobUrl } from '../../api/client'
import type { ClinicalAttachment } from '../../types/api'

export function ClinicalImageLightbox({
  attachment,
  onClose,
}: {
  attachment: ClinicalAttachment
  onClose: () => void
}) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    let active = true
    let blobUrl = ''
    setFailed(false)
    authenticatedFileBlobUrl(attachment.download_url)
      .then((nextUrl) => {
        blobUrl = nextUrl
        if (active) setUrl(nextUrl)
        else URL.revokeObjectURL(nextUrl)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [attachment.download_url])

  useEffect(() => {
    closeRef.current?.focus()
    if (typeof document === 'undefined') return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return (
    <div
      className="record-lightbox-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="record-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={attachment.description || 'Ảnh bệnh án'}
      >
        <header>
          <div>
            <strong>{attachment.kind === 'XRAY' ? 'X-quang' : 'Ảnh lâm sàng'}</strong>
            <p>{attachment.description || 'Không có mô tả'}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose}>
            Đóng
          </button>
        </header>
        {failed ? (
          <p>Không tải được ảnh.</p>
        ) : url ? (
          <img src={url} alt={attachment.description || 'Ảnh bệnh án'} />
        ) : (
          <p>Đang tải ảnh...</p>
        )}
      </div>
    </div>
  )
}
