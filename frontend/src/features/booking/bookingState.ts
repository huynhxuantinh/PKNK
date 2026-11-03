import type { Appointment, Branch, BranchDentist, BranchService, Slot } from '../../types/api'

export const BOOKING_DRAFT_STORAGE_KEY = 'pknk_booking_draft'
const BOOKING_HOLD_STORAGE_PREFIX = 'pknk_booking_hold:'
const BOOKING_ATTEMPT_STORAGE_PREFIX = 'pknk_booking_attempt:'

function bookingHoldStorageKey(userId: number) {
  return `${BOOKING_HOLD_STORAGE_PREFIX}${userId}`
}

function bookingAttemptStorageKey(userId: number) {
  return `${BOOKING_ATTEMPT_STORAGE_PREFIX}${userId}`
}

export interface BookingAttempt {
  key: string
  fingerprint: string
}

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `hold-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/**
 * Returns the idempotency key for one booking attempt. Retrying the same
 * selection reuses the key so the server can replay the hold it already
 * created; changing the selection starts a new attempt.
 */
export function bookingIdempotencyKey(
  userId: number,
  fingerprint: string,
  createKey: () => string = newIdempotencyKey,
) {
  const storageKey = bookingAttemptStorageKey(userId)
  try {
    const stored = sessionStorage.getItem(storageKey)
    if (stored) {
      const attempt = JSON.parse(stored) as BookingAttempt
      if (attempt.fingerprint === fingerprint && typeof attempt.key === 'string') {
        return attempt.key
      }
    }
  } catch {
    sessionStorage.removeItem(storageKey)
  }
  const key = createKey()
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ key, fingerprint }))
  } catch {
    // Session storage may be unavailable; retries fall back to a new key.
  }
  return key
}

export function clearBookingAttempt(userId: number) {
  try {
    sessionStorage.removeItem(bookingAttemptStorageKey(userId))
  } catch {
    // Ignore unavailable session storage.
  }
}

export function storeBookingHold(userId: number, appointment: Appointment) {
  try {
    sessionStorage.setItem(bookingHoldStorageKey(userId), JSON.stringify(appointment))
  } catch {
    // Session storage may be unavailable; the in-memory booking flow still works.
  }
}

export function restoreBookingHold(userId: number, now = Date.now()): Appointment | null {
  const key = bookingHoldStorageKey(userId)
  try {
    const stored = sessionStorage.getItem(key)
    if (!stored) return null
    const appointment = JSON.parse(stored) as Appointment
    const expiresAt = appointment.expires_at ? new Date(appointment.expires_at).getTime() : NaN
    if (appointment.status !== 'HELD' || !Number.isFinite(expiresAt) || expiresAt <= now) {
      sessionStorage.removeItem(key)
      return null
    }
    return appointment
  } catch {
    sessionStorage.removeItem(key)
    return null
  }
}

export function clearBookingHold(userId: number) {
  try {
    sessionStorage.removeItem(bookingHoldStorageKey(userId))
  } catch {
    // Ignore unavailable session storage.
  }
}

export function clearBookingHoldCaches() {
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index)
      if (
        key?.startsWith(BOOKING_HOLD_STORAGE_PREFIX)
        || key?.startsWith(BOOKING_ATTEMPT_STORAGE_PREFIX)
      ) {
        sessionStorage.removeItem(key)
      }
    }
  } catch {
    // Ignore unavailable session storage.
  }
}

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

function isValidDraftDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return false
  }
  return value >= dateInputValue() && value <= dateInputValue(90)
}

function isStoredBranch(value: unknown): value is Branch {
  return Boolean(
    value
      && typeof value === 'object'
      && Number.isInteger((value as Branch).id_branch)
      && (value as Branch).id_branch > 0,
  )
}

export function initialBookingSelection(): BookingSelection {
  if (typeof sessionStorage !== 'undefined') {
    try {
      const stored = sessionStorage.getItem(BOOKING_DRAFT_STORAGE_KEY)
      if (stored) {
        const draft = JSON.parse(stored) as BookingSelection
        if (isStoredBranch(draft.branch)) {
          return {
            branch: draft.branch,
            service: null,
            date: isValidDraftDate(draft.date) ? draft.date : dateInputValue(1),
            slot: null,
            dentist: null,
          }
        }
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
      if (state.branch?.id_branch === action.branch.id_branch) {
        return { ...state, branch: action.branch }
      }
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
