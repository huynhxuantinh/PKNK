import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'

import { ClinicalAttachmentPanel } from './ClinicalAttachmentPanel'
import type { ClinicalAttachment } from '../../types/api'

describe('ClinicalAttachmentPanel pending uploads', () => {
  it('reports selected and removed draft image counts to the parent', () => {
    const onPendingChange = vi.fn()
    const image = Object.assign(new Blob(['image'], { type: 'image/png' }), {
      name: 'xray.png',
      lastModified: Date.now(),
    }) as File
    let renderer: ReactTestRenderer

    act(() => {
      renderer = create(
        <ClinicalAttachmentPanel
          encounterId={11}
          attachments={[]}
          disabled={false}
          onChange={() => {}}
          onPendingChange={onPendingChange}
        />,
      )
    })
    const input = renderer!.root.findByType('input')
    act(() => {
      input.props.onChange({ target: { files: [image], value: 'xray.png' } })
    })

    expect(onPendingChange).toHaveBeenLastCalledWith(1)
    const removeDraft = renderer!.root.findAllByType('button').find((button) => button.children.join('') === 'Bỏ ảnh')
    act(() => { removeDraft!.props.onClick() })
    expect(onPendingChange).toHaveBeenLastCalledWith(0)
  })

  it('lists saved PDF and DICOM files so they can be downloaded or removed', () => {
    const attachments: ClinicalAttachment[] = [
      {
        id_clinical_attachment: 21,
        kind: 'DOCUMENT',
        content_type: 'application/pdf',
        size_bytes: 2048,
        description: 'Phiếu kết quả',
        download_url: '/dentist/me/clinical-attachments/21/download/',
      },
      {
        id_clinical_attachment: 22,
        kind: 'XRAY',
        content_type: 'application/dicom',
        size_bytes: 4096,
        description: 'Phim CT',
        download_url: '/dentist/me/clinical-attachments/22/download/',
      },
    ]

    let renderer: ReactTestRenderer
    act(() => {
      renderer = create(
        <ClinicalAttachmentPanel
          encounterId={11}
          attachments={attachments}
          disabled={false}
          onChange={() => {}}
          onPendingChange={() => {}}
        />,
      )
    })

    const fileRows = renderer!.root.findAll((node) => node.props.className === 'clinical-attachment-file')
    expect(fileRows).toHaveLength(2)
    expect(fileRows.map((row) => row.children.join(' ')).join(' ')).toContain('PDF')
    expect(fileRows.map((row) => row.children.join(' ')).join(' ')).toContain('DICOM')
    expect(renderer!.root.findAllByType('button').filter((button) => button.children.join('') === 'Xóa')).toHaveLength(2)
  })
})
