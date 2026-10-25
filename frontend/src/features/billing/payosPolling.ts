export async function pollInvoiceUntilPaid<T extends { status: string }>(
  fetchInvoice: () => Promise<T>,
  options: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const intervalMs = options.intervalMs ?? 2500
  const timeoutMs = options.timeoutMs ?? 60000
  const startedAt = Date.now()
  let latest = await fetchInvoice()
  while (latest.status !== 'PAID' && Date.now() - startedAt < timeoutMs) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, intervalMs)
      options.signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      }, { once: true })
    })
    latest = await fetchInvoice()
  }
  return latest
}
