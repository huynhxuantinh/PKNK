const auditDateFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const auditTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

export function formatAuditTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${auditDateFormatter.format(date)} ${auditTimeFormatter.format(date)}`
}

export function safeAuditJson(value: unknown) {
  if (value === null || value === undefined) return '{}'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return '[Không thể hiển thị dữ liệu]'
  }
}

export function auditAccessTypeLabel(value: 'READ' | 'WRITE') {
  return value === 'READ' ? 'Đọc' : 'Thay đổi'
}

export const commonAuditActions = [
  'BRANCH_CREATED',
  'BRANCH_UPDATED',
  'MEMBERSHIP_CREATED',
  'MEMBERSHIP_UPDATED',
  'STAFF_INVITATION_CREATED',
  'STAFF_INVITATION_ACCEPTED',
  'DENTIST_CREATED',
  'DENTIST_UPDATED',
  'SERVICE_CREATED',
  'SERVICE_UPDATED',
  'ORGANIZATION_UPDATED',
  'ORGANIZATION_REVENUE_REPORT_VIEWED',
  'ORGANIZATION_APPOINTMENT_REPORT_VIEWED',
  'ORGANIZATION_CHAIR_UTILIZATION_REPORT_VIEWED',
  'AUDIT_EVENTS_LIST',
] as const
