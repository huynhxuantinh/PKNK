export async function settledMapWithConcurrency<T, TResult>(
  items: T[],
  worker: (item: T) => Promise<TResult>,
  concurrency = 3,
) {
  const results = new Array<PromiseSettledResult<TResult>>(items.length)
  let nextIndex = 0
  const run = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index]) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, run))
  return results
}
