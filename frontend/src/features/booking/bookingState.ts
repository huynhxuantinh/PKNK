import type { Branch, BranchDentist, BranchService, Slot } from '../../types/api'

export const BOOKING_DRAFT_STORAGE_KEY = 'pknk_booking_draft'

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

export function emptyBookingSelection(): BookingSelection {
  return { branch: null, service: null, date: dateInputValue(1), slot: null, dentist: null }
}

export function dateInputValue(offsetDays = 0, now = new Date()) {
  const hcmDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const parts = Object.fromEntries(hcmDate.map((part) => [part.type, part.value]))
  const date = new Date(Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day) + offsetDays,
  ))
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function initialBookingSelection(): BookingSelection {
  if (typeof window !== 'undefined') {
    try {
      const stored = sessionStorage.getItem(BOOKING_DRAFT_STORAGE_KEY)
      if (stored) {
        const draft = JSON.parse(stored) as BookingSelection
        if (draft.branch && typeof draft.date === 'string') return draft
      }
    } catch {
      sessionStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY)
    }
  }
  return emptyBookingSelection()
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
      // A reset starts a new booking; it must not restore the previous draft.
      return emptyBookingSelection()
  }
}
