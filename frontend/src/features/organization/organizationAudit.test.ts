import { describe, expect, it } from 'vitest'

import {
  auditAccessTypeLabel,
  formatAuditTimestamp,
  safeAuditJson,
} from './organizationAudit'

describe('audit presentation', () => {
  it('formats timestamps in Vietnam time', () => {
    expect(formatAuditTimestamp('2026-10-26T03:04:05Z')).toBe('26/10/2026 10:04:05')
  })

  it('renders JSON as safe text', () => {
    expect(safeAuditJson({ note: '<b>hello</b>' })).toBe(
      '{\n  "note": "<b>hello</b>"\n}',
    )
    expect(safeAuditJson(null)).toBe('{}')
  })

  it('turns a circular value into a fallback instead of throwing', () => {
    const value: Record<string, unknown> = {}
    value.self = value
    expect(safeAuditJson(value)).toBe('[Không thể hiển thị dữ liệu]')
  })

  it('labels access types in Vietnamese', () => {
    expect(auditAccessTypeLabel('READ')).toBe('Đọc')
    expect(auditAccessTypeLabel('WRITE')).toBe('Thay đổi')
  })
})
