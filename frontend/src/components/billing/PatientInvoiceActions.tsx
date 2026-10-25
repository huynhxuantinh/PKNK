import type { PatientInvoice } from '../../types/api'

export function PatientInvoiceActions({ status, busy, onPay }: {
  status: PatientInvoice['status']
  busy: boolean
  onPay: () => void
}) {
  if (status !== 'ISSUED') return null
  return <button className="button button-primary invoice-payos-button" type="button" disabled={busy} onClick={onPay}>{busy ? 'Đang tạo liên kết...' : 'Thanh toán qua payOS'}</button>
}
