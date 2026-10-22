import type { Branch, BranchDentist, BranchService, Slot } from '../../types/api'

export interface BookingSelection {
  branch: Branch | null
  service: BranchService | null
  date: string
  slot: Slot | null
  dentist: BranchDentist | null
}

export type BookingAction =
  | { type: 'select_branch'; branch: Branch }
  | { type: 'select_service'; service: BranchService }
  | { type: 'select_date'; date: string }
  | { type: 'select_slot'; slot: Slot }
  | { type: 'select_dentist'; dentist: BranchDentist }
  | { type: 'reset' }

export function dateInputValue(offsetDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function initialBookingSelection(): BookingSelection {
  return { branch: null, service: null, date: dateInputValue(1), slot: null, dentist: null }
}

export function bookingSelectionReducer(
  state: BookingSelection,
  action: BookingAction,
): BookingSelection {
  switch (action.type) {
    case 'select_branch':
      return { ...state, branch: action.branch, service: null, slot: null, dentist: null }
    case 'select_service':
      return { ...state, service: action.service, slot: null, dentist: null }
    case 'select_date':
      return { ...state, date: action.date, slot: null, dentist: null }
    case 'select_slot':
      return { ...state, slot: action.slot, dentist: null }
    case 'select_dentist':
      return { ...state, dentist: action.dentist }
    case 'reset':
      return initialBookingSelection()
  }
}
