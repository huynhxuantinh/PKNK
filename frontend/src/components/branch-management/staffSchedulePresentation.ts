export const weekdayLabels = [
  'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật',
]

export interface WorkShiftFormValues {
  dentist_id: string
  weekday: string
  start_time: string
  end_time: string
  valid_from: string
  valid_to: string
}

export function buildWorkShiftPayload(shift: WorkShiftFormValues) {
  return {
    dentist_id: Number(shift.dentist_id),
    weekday: Number(shift.weekday),
    start_time: shift.start_time,
    end_time: shift.end_time,
    valid_from: shift.valid_from,
    valid_to: shift.valid_to || null,
  }
}

export function toHcmLocalInput(value: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}T${valueOf('hour')}:${valueOf('minute')}`
}
