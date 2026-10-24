import { describe, expect, it } from 'vitest'

describe('BranchManagementPage structure', () => {
  it('keeps the appointment list and dialogs in dedicated components', () => {
    const modules = import.meta.glob('../components/branch-management/*.tsx')

    const productionComponents = Object.keys(modules).filter(
      (path) => !path.endsWith('.test.tsx'),
    )

    expect(productionComponents.sort()).toEqual([
      '../components/branch-management/AppointmentList.tsx',
      '../components/branch-management/CancelAppointmentModal.tsx',
      '../components/branch-management/InvoiceManagement.tsx',
      '../components/branch-management/ManagementSectionNav.tsx',
      '../components/branch-management/RescheduleAppointmentModal.tsx',
      '../components/branch-management/StaffScheduleList.tsx',
    ])
  })
})
