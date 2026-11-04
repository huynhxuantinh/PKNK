import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'

import { ClinicalAmendmentsPanel } from './ClinicalAmendmentsPanel'

vi.mock('../../api/dentist', () => ({
  createClinicalAmendment: vi.fn(),
}))

describe('ClinicalAmendmentsPanel unsaved changes', () => {
  it('reports amendment drafts so the page can block navigation', () => {
    const onDirtyChange = vi.fn()
    let renderer: ReactTestRenderer
    act(() => {
      renderer = create(
        <ClinicalAmendmentsPanel
          encounterId={12}
          amendments={[]}
          canCreate
          onDirtyChange={onDirtyChange}
          onCreated={() => {}}
        />,
      )
    })

    const contentField = renderer!.root.findAllByType('textarea')[0]
    act(() => contentField.props.onChange({ target: { value: 'Bổ sung hồ sơ' } }))

    expect(onDirtyChange).toHaveBeenLastCalledWith('clinical-amendment:create', true)
  })
})
