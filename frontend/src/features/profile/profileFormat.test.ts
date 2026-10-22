import { describe, expect, it } from 'vitest'

import { displayGender, displayProfileValue } from './profileFormat'

describe('patient profile formatting', () => {
  it('shows a friendly placeholder for missing values', () => {
    expect(displayProfileValue(null)).toBe('Chưa cập nhật')
    expect(displayProfileValue('')).toBe('Chưa cập nhật')
  })

  it('translates stored gender values', () => {
    expect(displayGender('MALE')).toBe('Nam')
    expect(displayGender('FEMALE')).toBe('Nữ')
    expect(displayGender('OTHER')).toBe('Khác')
  })
})
