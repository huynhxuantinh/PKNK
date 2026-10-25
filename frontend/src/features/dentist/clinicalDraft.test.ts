import { describe, expect, it } from 'vitest'

import {
  CLINICAL_DRAFT_TTL_MS,
  clearClinicalDraft,
  clinicalFormsEqual,
  readClinicalDraft,
  type ClinicalDraftFields,
  writeClinicalDraft,
} from './clinicalDraft'

const form: ClinicalDraftFields = {
  chief_complaint: 'Đau răng',
  medical_history: '',
  diagnosis_summary: 'Viêm tủy',
  notes: 'Theo dõi',
  aftercare_instructions: 'Tránh đồ nóng',
}

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

describe('clinical draft storage', () => {
  it('stores drafts separately by appointment code', () => {
    const storage = memoryStorage()
    writeClinicalDraft(storage, 'APT-001', form)

    expect(readClinicalDraft(storage, 'APT-001')).toEqual(form)
    expect(readClinicalDraft(storage, 'APT-002')).toBeNull()
  })

  it('removes expired and explicitly cleared drafts', () => {
    const storage = memoryStorage()
    writeClinicalDraft(storage, 'APT-001', form)
    expect(readClinicalDraft(storage, 'APT-001', Date.now() + CLINICAL_DRAFT_TTL_MS + 1)).toBeNull()

    writeClinicalDraft(storage, 'APT-001', form)
    clearClinicalDraft(storage, 'APT-001')
    expect(readClinicalDraft(storage, 'APT-001')).toBeNull()
  })

  it('detects changes compared with the server copy', () => {
    expect(clinicalFormsEqual(form, { ...form })).toBe(true)
    expect(clinicalFormsEqual(form, { ...form, notes: 'Đã đổi' })).toBe(false)
  })
})
