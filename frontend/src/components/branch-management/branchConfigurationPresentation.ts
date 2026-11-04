import type { ManagedHoliday } from '../../api/management'
import type { ManagedBranchService } from '../../api/management'

export interface BranchServiceFormValues {
  service_id: string
  price: string
  duration_minutes: string
  buffer_minutes: string
}

export function branchServiceFormValues(item: ManagedBranchService): BranchServiceFormValues {
  return {
    service_id: String(item.service_id),
    price: item.price,
    duration_minutes: item.duration_minutes === null ? '' : String(item.duration_minutes),
    buffer_minutes: item.buffer_minutes === null ? '' : String(item.buffer_minutes),
  }
}

export function buildBranchServicePayload(form: BranchServiceFormValues) {
  const optionalMinutes = (value: string) => value.trim() === '' ? null : Number(value)

  return {
    service_id: Number(form.service_id),
    price: form.price,
    duration_minutes: optionalMinutes(form.duration_minutes),
    buffer_minutes: optionalMinutes(form.buffer_minutes),
  }
}

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
