import { useEffect, useState } from 'react'

import { authenticatedFileBlobUrl } from '../../api/client'
import type { ClinicalAttachment } from '../../types/api'

export function AuthenticatedThumbnail({ attachment }: { attachment: ClinicalAttachment }) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)

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

  if (failed) return <span>Không tải được ảnh</span>
  return url ? <img src={url} alt={attachment.description || 'Ảnh bệnh án'} /> : <span>Đang tải ảnh...</span>
}
