import { describe, expect, it } from 'vitest'

import { sanitizeCsvCell } from './organizationReportExport'

describe('sanitizeCsvCell', () => {
  it('keeps ordinary values unchanged', () => {
    expect(sanitizeCsvCell('PKNK DentaVie')).toBe('PKNK DentaVie')
    expect(sanitizeCsvCell(120000)).toBe('120000')
  })

  it.each(['=1+1', '+SUM(A1:A2)', '-1+2', '@SUM(A1:A2)', '  =cmd()'])(
    'prefixes spreadsheet formula-like text: %s',
    (value) => {
      expect(sanitizeCsvCell(value)).toBe(`'${value}`)
    },
  )
})
