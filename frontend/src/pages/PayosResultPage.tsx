import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { getPatientInvoice } from '../api/billing'
import { AuthBar } from '../auth/AuthBar'
import { pollInvoiceUntilPaid } from '../features/billing/payosPolling'
import { Seo } from '../seo/Seo'

type ResultState = 'checking' | 'paid' | 'pending' | 'error'

export function PayosResultPage() {
  const [searchParams] = useSearchParams()
  const invoiceId = Number(searchParams.get('invoice'))
  const [state, setState] = useState<ResultState>('checking')
  const [retry, setRetry] = useState(0)
  const checkPayment = useCallback(async (signal: AbortSignal) => {
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) return setState('error')
    setState('checking')
    try {
      const invoice = await pollInvoiceUntilPaid(
        () => getPatientInvoice(invoiceId).then((response) => response.data),
        { signal },
      )
      setState(invoice.status === 'PAID' ? 'paid' : 'pending')
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setState('error')
    }
  }, [invoiceId])
  useEffect(() => {
    const controller = new AbortController()
    void checkPayment(controller.signal)
    return () => controller.abort()
  }, [checkPayment, retry])
  return <div className="site-shell payos-result-page">
    <Seo title="Kết quả thanh toán | DentaVie" description="Kiểm tra kết quả thanh toán hóa đơn." path="/hoa-don/ket-qua" noIndex />
    <header className="site-header"><Link className="brand" to="/"><img src="/branding/dentavie-logo-horizontal-color.png" alt="DentaVie" /></Link><AuthBar /></header>
    <main className="payos-result-card" aria-live="polite">
      {state === 'checking' && <><span className="payos-result-icon">…</span><h1>Đang kiểm tra thanh toán</h1><p>Hệ thống đang đối chiếu trực tiếp với hóa đơn của bạn.</p></>}
      {state === 'paid' && <><span className="payos-result-icon is-success">✓</span><h1>Thanh toán thành công</h1><p>Hóa đơn đã được ghi nhận thanh toán.</p></>}
      {state === 'pending' && <><span className="payos-result-icon">⌛</span><h1>Chưa nhận được thanh toán</h1><p>Giao dịch có thể cần thêm thời gian để đối soát.</p><button className="button button-primary" type="button" onClick={() => setRetry((value) => value + 1)}>Kiểm tra lại</button></>}
      {state === 'error' && <><span className="payos-result-icon is-error">!</span><h1>Không thể kiểm tra hóa đơn</h1><p>Liên kết không hợp lệ hoặc hệ thống đang tạm gián đoạn.</p></>}
      <Link className="button button-secondary" to="/hoa-don">Về danh sách hóa đơn</Link>
    </main>
  </div>
}
