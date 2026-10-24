import type { ManagedHoliday } from '../../api/management'

export interface HolidayFormValues {
  holiday_date: string
  name: string
  is_closed: boolean
}

export function buildHolidayPayload(
  currentBranchId: number,
  form: HolidayFormValues,
  editingHoliday: Pick<ManagedHoliday, 'branch_id'> | null,
) {
  return {
    branch_id: editingHoliday ? editingHoliday.branch_id : currentBranchId,
    ...form,
  }
}
