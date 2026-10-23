import { describe, expect, it } from 'vitest'

import { downloadRequestPath } from './client'

describe('downloadRequestPath', () => {
  it('uses the same-origin proxy path for an absolute Docker URL', () => {
    expect(downloadRequestPath('http://web:8000/api/v1/clinical/attachments/8/download/?preview=1'))
      .toBe('/api/v1/clinical/attachments/8/download/?preview=1')
  })

  it('does not duplicate the API prefix for an API-relative URL', () => {
    expect(downloadRequestPath('/api/v1/clinical/attachments/8/download/'))
      .toBe('/api/v1/clinical/attachments/8/download/')
  })
})
