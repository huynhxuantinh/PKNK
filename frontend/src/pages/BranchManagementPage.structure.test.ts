import { describe, expect, it } from 'vitest'

describe('BranchManagementPage structure', () => {
  it('keeps the appointment list and dialogs in dedicated components', () => {
    const modules = import.meta.glob('../components/branch-management/*.tsx')

    expect(Object.keys(modules).sort()).toEqual([
      '../components/branch-management/AppointmentList.tsx',
      '../components/branch-management/CancelAppointmentModal.tsx',
      '../components/branch-management/RescheduleAppointmentModal.tsx',
    ])
  })
})
