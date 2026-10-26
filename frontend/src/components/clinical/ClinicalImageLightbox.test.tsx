import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ClinicalImageLightbox } from './ClinicalImageLightbox'
import type { ClinicalAttachment } from '../../types/api'

const { authenticatedFileBlobUrl } = vi.hoisted(() => ({
  authenticatedFileBlobUrl: vi.fn(),
}))

vi.mock('../../api/client', () => ({ authenticatedFileBlobUrl }))

const attachment: ClinicalAttachment = {
  id_clinical_attachment: 7,
  kind: 'XRAY',
  content_type: 'image/png',
  size_bytes: 2048,
  description: 'X-quang răng 36',
  download_url: '/api/v1/clinical/attachments/7/download/',
}

describe('ClinicalImageLightbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticatedFileBlobUrl.mockResolvedValue('blob:preview')
  })

  it('loads the image into a blob url instead of downloading it', async () => {
    let renderer: ReactTestRenderer
    await act(async () => {
      renderer = create(
        <ClinicalImageLightbox attachment={attachment} onClose={() => {}} />,
      )
    })
    await act(async () => undefined)

    expect(authenticatedFileBlobUrl).toHaveBeenCalledWith(attachment.download_url)
    const image = renderer!.root.findByType('img')
    expect(image.props.src).toBe('blob:preview')
    expect(image.props.alt).toBe('X-quang răng 36')
  })

  it('closes from the close button and the backdrop', async () => {
    const onClose = vi.fn()
    let renderer: ReactTestRenderer
    await act(async () => {
      renderer = create(
        <ClinicalImageLightbox attachment={attachment} onClose={onClose} />,
      )
    })
    await act(async () => undefined)

    const closeButton = renderer!.root
      .findAllByType('button')
      .find((button) => JSON.stringify(button.children).includes('Đóng'))
    act(() => {
      closeButton!.props.onClick()
    })
    expect(onClose).toHaveBeenCalledTimes(1)

    const backdrop = renderer!.root.findAll(
      (node) => node.props.className === 'record-lightbox-backdrop',
    )[0]
    act(() => {
      const backdropElement = { id: 'backdrop' }
      backdrop.props.onMouseDown({
        target: backdropElement,
        currentTarget: backdropElement,
      })
    })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('shows a fallback when the image cannot be loaded', async () => {
    authenticatedFileBlobUrl.mockRejectedValue(new Error('nope'))
    let renderer: ReactTestRenderer
    await act(async () => {
      renderer = create(
        <ClinicalImageLightbox attachment={attachment} onClose={() => {}} />,
      )
    })
    await act(async () => undefined)

    const markup = JSON.stringify(renderer!.toJSON())
    expect(markup).toContain('Không tải được ảnh.')
    expect(renderer!.root.findAllByType('img')).toHaveLength(0)
  })
})
