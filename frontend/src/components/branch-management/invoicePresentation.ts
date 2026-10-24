import type { ManagedInvoiceStatus } from '../../api/management'

export const invoiceStatusLabels: Record<ManagedInvoiceStatus, string> = {
  DRAFT: 'Bản nháp',
  ISSUED: 'Đã phát hành',
  PAID: 'Đã thanh toán',
  VOID: 'Đã hủy',
}
