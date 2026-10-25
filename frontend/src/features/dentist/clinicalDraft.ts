export type ClinicalDraftFields = {
  chief_complaint: string
  medical_history: string
  diagnosis_summary: string
  notes: string
  aftercare_instructions: string
}

const STORAGE_PREFIX = 'dentavie:clinical-draft:'
export const CLINICAL_DRAFT_TTL_MS = 24 * 60 * 60 * 1000

type StoredClinicalDraft = {
  savedAt: number
  userId: number
  publicCode: string
  serverUpdatedAt: string
  form: ClinicalDraftFields
}

function keyFor(userId: number, publicCode: string) {
  return `${STORAGE_PREFIX}${userId}:${publicCode}`
}

function isClinicalDraftFields(value: unknown): value is ClinicalDraftFields {
  if (!value || typeof value !== 'object') return false
  const draft = value as Record<string, unknown>
  return ['chief_complaint', 'medical_history', 'diagnosis_summary', 'notes', 'aftercare_instructions']
    .every((field) => typeof draft[field] === 'string')
}

export function readClinicalDraft(
  storage: Storage,
  userId: number,
  publicCode: string,
  now = Date.now(),
  serverUpdatedAt?: string,
) {
  const key = keyFor(userId, publicCode)
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredClinicalDraft>
    if (
      typeof parsed.savedAt !== 'number'
      || now - parsed.savedAt > CLINICAL_DRAFT_TTL_MS
      || parsed.userId !== userId
      || parsed.publicCode !== publicCode
      || (serverUpdatedAt !== undefined && parsed.serverUpdatedAt !== serverUpdatedAt)
      || !isClinicalDraftFields(parsed.form)
    ) {
      storage.removeItem(key)
      return null
    }
    return parsed.form
  } catch {
    storage.removeItem(key)
    return null
  }
}

export function writeClinicalDraft(
  storage: Storage,
  userId: number,
  publicCode: string,
  form: ClinicalDraftFields,
  serverUpdatedAt = '',
) {
  try {
    storage.setItem(keyFor(userId, publicCode), JSON.stringify({
      savedAt: Date.now(),
      userId,
      publicCode,
      serverUpdatedAt,
      form,
    }))
  } catch {
    // Storage can be unavailable in private mode or when the quota is full.
  }
}

export function clearClinicalDraft(storage: Storage, userId: number, publicCode: string) {
  try {
    storage.removeItem(keyFor(userId, publicCode))
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}

export function clearAllClinicalDrafts(storage: Storage) {
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index)
      if (key?.startsWith(STORAGE_PREFIX)) storage.removeItem(key)
    }
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

export function clearClinicalDraftCaches() {
  if (typeof window === 'undefined') return
  try { clearAllClinicalDrafts(window.sessionStorage) } catch { /* unavailable */ }
  // Remove drafts written by older app versions before storage was session-scoped.
  try { clearAllClinicalDrafts(window.localStorage) } catch { /* unavailable */ }
}

export function clinicalFormsEqual(left: ClinicalDraftFields, right: ClinicalDraftFields) {
  return Object.keys(left).every((key) => (
    left[key as keyof ClinicalDraftFields] === right[key as keyof ClinicalDraftFields]
  ))
}
