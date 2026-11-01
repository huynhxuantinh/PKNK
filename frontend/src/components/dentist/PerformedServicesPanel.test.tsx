import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { PerformedServicesPanel } from './PerformedServicesPanel'
import type { BranchService, ClinicalEncounter } from '../../types/api'

const branchServices: BranchService[] = [
  {
    id_branch_service: 7,
    id_service: 3,
    name: 'Khám tổng quát',
    code: 'GENERAL',
    description: null,
    price: '200000.00',
    duration_minutes: 30,
    buffer_minutes: 0,
  },
]

function encounter(updatedAt: string): ClinicalEncounter {
  return {
    id_clinical_encounter: 12,
    appointment_id: 24,
    status: 'DRAFT',
    chief_complaint: '',
    medical_history: '',
    diagnosis_summary: '',
    notes: '',
    aftercare_instructions: '',
    performed_services_confirmed: false,
    performed_services: [],
    finalized_at: null,
    updated_at: updatedAt,
    attachments: [],
  }
}

describe('PerformedServicesPanel', () => {
  it('keeps unsaved services when a text-only draft save changes encounter updated_at', () => {
    const onDirtyChange = vi.fn()
    let renderer: ReactTestRenderer

    act(() => {
      renderer = create(
        <PerformedServicesPanel
          encounter={encounter('2026-11-02T08:00:00+07:00')}
          branchServices={branchServices}
          disabled={false}
          onSaved={() => {}}
          onDirtyChange={onDirtyChange}
        />,
      )
    })

    const addButton = renderer!.root
      .findAllByType('button')
      .find((button) => button.children.join('') === '+ Thêm dịch vụ')
    act(() => { addButton!.props.onClick() })
    expect(renderer!.root.findAll((node) => node.props.className === 'performed-service-number')).toHaveLength(1)

    act(() => {
      renderer!.update(
        <PerformedServicesPanel
          encounter={encounter('2026-11-02T08:05:00+07:00')}
          branchServices={branchServices}
          disabled={false}
          onSaved={() => {}}
          onDirtyChange={onDirtyChange}
        />,
      )
    })

    expect(renderer!.root.findAll((node) => node.props.className === 'performed-service-number')).toHaveLength(1)
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  })

  it('shows saved service snapshots in read-only encounters even when the service is no longer active', () => {
    const closedEncounter: ClinicalEncounter = {
      ...encounter('2026-11-02T08:10:00+07:00'),
      status: 'FINALIZED',
      performed_services_confirmed: true,
      performed_services: [{
        id_clinical_performed_service: 45,
        branch_service_id: 999,
        service_code_snapshot: 'SCALING',
        service_name_snapshot: 'Lấy cao răng',
        unit_price_snapshot: '350000.00',
        quantity: 2,
        tooth_reference: 'Răng 16, 26',
        clinical_note: 'Đã làm sạch cao răng.',
        created_at: '2026-11-02T08:00:00+07:00',
        updated_at: '2026-11-02T08:00:00+07:00',
      }],
    }

    const markup = renderToStaticMarkup(
      <PerformedServicesPanel
        encounter={closedEncounter}
        branchServices={[]}
        disabled
        onSaved={() => {}}
        onDirtyChange={() => {}}
      />,
    )

    expect(markup).toContain('Lấy cao răng')
    expect(markup).toContain('Răng 16, 26')
    expect(markup).toContain('Đã làm sạch cao răng.')
    expect(markup).not.toContain('Dịch vụ không còn hoạt động')
  })
})
