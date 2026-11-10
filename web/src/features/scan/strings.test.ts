import { describe, expect, it } from 'vitest'
import { scanStrings } from './strings'

// R10: Scan is a GLOSSARY term, capitalised in every count.
// R11a: and everywhere else, mid-sentence too, like Shop, Stock or Recipe elsewhere in the copy.
describe('scan counts', () => {
  it.each([
    [1, '1 Scan waiting to sync', "1 Scan couldn't sync"],
    [2, '2 Scans waiting to sync', "2 Scans couldn't sync"],
    [3, '3 Scans waiting to sync', "3 Scans couldn't sync"],
  ])('%s', (n, queued, rejected) => {
    expect(scanStrings.queued(n)).toBe(queued)
    expect(scanStrings.rejectedCount(n)).toBe(rejected)
  })
})

describe('the noun "Scan" in scan copy (R11a N7)', () => {
  const samples: string[] = []
  for (const value of Object.values(scanStrings)) {
    if (typeof value === 'string') samples.push(value)
    else if (typeof value === 'function') samples.push((value as (...a: unknown[]) => string)('Pasta', 'message', 2))
    else for (const nested of Object.values(value)) samples.push(String(nested))
  }

  it('is always capitalised (the verb "to scan" stays lowercase)', () => {
    const offenders = samples.filter((text) => /(?<!\bto )\bscans?\b/.test(text))
    expect(offenders).toEqual([])
  })

  it('keeps the shapes of the sentences', () => {
    expect(scanStrings.offline).toBe('Offline: Scans are kept and sent when you are back online')
    expect(scanStrings.rejected('x')).toBe("Couldn't sync a Scan: x")
  })
})
