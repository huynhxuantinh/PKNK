import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TreatmentPlanPanel } from './TreatmentPlanPanel'
import type { TreatmentPlan } from '../../types/api'

const { updateTreatmentPlan, deleteTreatmentPlanItem } = vi.hoisted(() => ({
  updateTreatmentPlan: vi.fn(),
  deleteTreatmentPlanItem: vi.fn(),
}))

vi.mock('../../api/dentist', () => ({
  updateTreatmentPlan,
  deleteTreatmentPlanItem,
}))

const draftPlan: TreatmentPlan = {
  id_treatment_plan: 41,
  originating_encounter_id: 12,
  patient_profile_id: 9,
  dentist_id: 3,
  branch_id: 1,
  title: 'Kế hoạch điều trị',
  description: '',
  status: 'DRAFT',
  total_estimate: '100000',
  items: [],
  created_at: '2026-01-01T08:00:00Z',
  updated_at: '2026-01-01T08:00:00Z',
}

describe('TreatmentPlanPanel confirmations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateTreatmentPlan.mockImplementation(async (_id, input) => ({
      data: { ...draftPlan, ...input },
    }))
    deleteTreatmentPlanItem.mockResolvedValue({ data: {} })
  })

  it('confirms before cancelling a plan', async () => {
    let renderer: ReactTestRenderer
    act(() => {
      renderer = create(
        <TreatmentPlanPanel
          encounterId={12}
          plans={[draftPlan]}
          services={[]}
          onChange={() => {}}
          onDirtyChange={() => {}}
        />,
      )
    })

    const cancelPlan = renderer!.root.findAllByType('button').find(
      (button) => button.children.join('') === 'Hủy kế hoạch',
    )
    act(() => cancelPlan!.props.onClick())

    expect(renderer!.root.findByProps({ role: 'alertdialog' })).toBeTruthy()
    expect(updateTreatmentPlan).not.toHaveBeenCalled()

    const dialog = renderer!.root.findByProps({ role: 'alertdialog' })
    const confirm = dialog.findAllByType('button').find(
      (button) => button.children.join('') === 'Hủy kế hoạch',
    )
    await act(async () => confirm!.props.onClick())

    expect(updateTreatmentPlan).toHaveBeenCalledWith(41, { status: 'CANCELLED' })
  })
})
