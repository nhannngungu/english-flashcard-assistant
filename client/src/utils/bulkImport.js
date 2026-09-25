export function parseBulkWords(input) {
  const seen = new Set()

  return input
    .split(/[\n,;]/)
    .map((entry) => entry.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US'))
    .filter((word) => {
      if (!word || seen.has(word)) {
        return false
      }

      seen.add(word)
      return true
    })
}

export async function runWithConcurrency(items, worker, limit = 3) {
  let nextIndex = 0
  const workerCount = Math.min(Math.max(1, limit), items.length)

  async function runWorker() {
    while (nextIndex < items.length) {
      const item = items[nextIndex]
      nextIndex += 1
      await worker(item)
    }
  }

  await Promise.all(Array.from({ length: workerCount }, runWorker))
}
