import type { ManagedInvoice, ManagedInvoiceStatus } from '../../api/management'

export const invoiceStatusLabels: Record<ManagedInvoiceStatus, string> = {
  DRAFT: 'Bản nháp',
  ISSUED: 'Đã phát hành',
  PAID: 'Đã thanh toán',
  VOID: 'Đã hủy',
}

export function latestVoidedInvoiceId(invoices: ManagedInvoice[]) {
  let latest: ManagedInvoice | undefined
  let latestTimestamp = Number.NEGATIVE_INFINITY

  for (const invoice of invoices) {
    if (invoice.status !== 'VOID' || !invoice.voided_at) continue
    const timestamp = Date.parse(invoice.voided_at)
    if (!Number.isFinite(timestamp)) continue
    if (
      timestamp > latestTimestamp ||
      (timestamp === latestTimestamp && invoice.id_invoice > (latest?.id_invoice ?? 0))
    ) {
      latest = invoice
      latestTimestamp = timestamp
    }
  }

  return latest?.id_invoice
}
