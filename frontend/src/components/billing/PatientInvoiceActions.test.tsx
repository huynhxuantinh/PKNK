import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'

import { PatientInvoiceActions } from './PatientInvoiceActions'

describe('PatientInvoiceActions', () => {
  it('only offers payOS checkout for an issued invoice', async () => {
    const onPay = vi.fn()
    let issued
    let paid
    await act(async () => {
      issued = create(<PatientInvoiceActions status="ISSUED" busy={false} onPay={onPay} />)
      paid = create(<PatientInvoiceActions status="PAID" busy={false} onPay={onPay} />)
    })

    expect(issued!.root.findAllByType('button')).toHaveLength(1)
    expect(paid!.root.findAllByType('button')).toHaveLength(0)
  })
})
