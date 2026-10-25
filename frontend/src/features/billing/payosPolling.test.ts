import { describe, expect, it, vi } from 'vitest'

import { pollInvoiceUntilPaid } from './payosPolling'

describe('pollInvoiceUntilPaid', () => {
  it('keeps checking the server invoice until it becomes PAID', async () => {
    const fetchInvoice = vi.fn()
      .mockResolvedValueOnce({ status: 'ISSUED' })
      .mockResolvedValueOnce({ status: 'PAID' })

    const result = await pollInvoiceUntilPaid(fetchInvoice, {
      intervalMs: 0,
      timeoutMs: 100,
    })

    expect(result.status).toBe('PAID')
    expect(fetchInvoice).toHaveBeenCalledTimes(2)
  })
})
