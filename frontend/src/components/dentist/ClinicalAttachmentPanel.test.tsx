import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'

import { ClinicalAttachmentPanel } from './ClinicalAttachmentPanel'

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
})
