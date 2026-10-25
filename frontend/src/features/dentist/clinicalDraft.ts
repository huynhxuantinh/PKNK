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
  form: ClinicalDraftFields
}

function keyFor(publicCode: string) {
  return `${STORAGE_PREFIX}${publicCode}`
}

function isClinicalDraftFields(value: unknown): value is ClinicalDraftFields {
  if (!value || typeof value !== 'object') return false
  const draft = value as Record<string, unknown>
  return ['chief_complaint', 'medical_history', 'diagnosis_summary', 'notes', 'aftercare_instructions']
    .every((field) => typeof draft[field] === 'string')
}

export function readClinicalDraft(storage: Storage, publicCode: string, now = Date.now()) {
  const key = keyFor(publicCode)
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredClinicalDraft>
    if (
      typeof parsed.savedAt !== 'number'
      || now - parsed.savedAt > CLINICAL_DRAFT_TTL_MS
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

export function writeClinicalDraft(storage: Storage, publicCode: string, form: ClinicalDraftFields) {
  try {
    storage.setItem(keyFor(publicCode), JSON.stringify({ savedAt: Date.now(), form }))
  } catch {
    // Storage can be unavailable in private mode or when the quota is full.
  }
}

export function clearClinicalDraft(storage: Storage, publicCode: string) {
  try {
    storage.removeItem(keyFor(publicCode))
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}

export function clinicalFormsEqual(left: ClinicalDraftFields, right: ClinicalDraftFields) {
  return Object.keys(left).every((key) => (
    left[key as keyof ClinicalDraftFields] === right[key as keyof ClinicalDraftFields]
  ))
}
