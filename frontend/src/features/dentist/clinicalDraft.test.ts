import { describe, expect, it } from 'vitest'

import {
  CLINICAL_DRAFT_TTL_MS,
  clearAllClinicalDrafts,
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
  it('stores drafts separately by user and appointment code', () => {
    const storage = memoryStorage()
    writeClinicalDraft(storage, 7, 'APT-001', form)

    expect(readClinicalDraft(storage, 7, 'APT-001')).toEqual(form)
    expect(readClinicalDraft(storage, 8, 'APT-001')).toBeNull()
    expect(readClinicalDraft(storage, 7, 'APT-002')).toBeNull()
  })

  it('removes expired and explicitly cleared drafts', () => {
    const storage = memoryStorage()
    writeClinicalDraft(storage, 7, 'APT-001', form)
    expect(readClinicalDraft(storage, 7, 'APT-001', Date.now() + CLINICAL_DRAFT_TTL_MS + 1)).toBeNull()

    writeClinicalDraft(storage, 7, 'APT-001', form)
    clearClinicalDraft(storage, 7, 'APT-001')
    expect(readClinicalDraft(storage, 7, 'APT-001')).toBeNull()
  })

  it('clears every clinical draft without deleting unrelated session data', () => {
    const storage = memoryStorage()
    writeClinicalDraft(storage, 7, 'APT-001', form)
    writeClinicalDraft(storage, 8, 'APT-002', form)
    storage.setItem('unrelated', 'keep')

    clearAllClinicalDrafts(storage)

    expect(readClinicalDraft(storage, 7, 'APT-001')).toBeNull()
    expect(readClinicalDraft(storage, 8, 'APT-002')).toBeNull()
    expect(storage.getItem('unrelated')).toBe('keep')
  })

  it('detects changes compared with the server copy', () => {
    expect(clinicalFormsEqual(form, { ...form })).toBe(true)
    expect(clinicalFormsEqual(form, { ...form, notes: 'Đã đổi' })).toBe(false)
  })

  it('discards a local draft when the server encounter was updated elsewhere', () => {
    const storage = memoryStorage()
    const originalServerVersion = '2026-10-25T08:00:00+07:00'
    writeClinicalDraft(storage, 7, 'APT-001', form, originalServerVersion)

    expect(readClinicalDraft(storage, 7, 'APT-001', Date.now(), originalServerVersion)).toEqual(form)
    expect(readClinicalDraft(storage, 7, 'APT-001', Date.now(), '2026-10-25T09:00:00+07:00')).toBeNull()
  })
})
