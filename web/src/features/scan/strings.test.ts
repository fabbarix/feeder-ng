import { describe, expect, it } from 'vitest'
import { scanStrings } from './strings'

// R11a N7: one rule for the word. "Scan" is capitalised only as a title or at the start of a sentence; mid-sentence and in
// counts ("1 scan", "2 scans") it is lowercase, the way "recipe" or "shop" would be.
describe('scan counts', () => {
  it.each([
    [1, '1 scan waiting to sync', "1 scan couldn't sync"],
    [2, '2 scans waiting to sync', "2 scans couldn't sync"],
    [3, '3 scans waiting to sync', "3 scans couldn't sync"],
  ])('%s', (n, queued, rejected) => {
    expect(scanStrings.queued(n)).toBe(queued)
    expect(scanStrings.rejectedCount(n)).toBe(rejected)
  })
})

describe('the word "scan" in scan copy', () => {
  const samples: string[] = []
  for (const value of Object.values(scanStrings)) {
    if (typeof value === 'string') samples.push(value)
    else if (typeof value === 'function') samples.push((value as (...a: unknown[]) => string)('Pasta', 'message', 2))
    else for (const nested of Object.values(value)) samples.push(String(nested))
  }

  it('is never capitalised mid-sentence', () => {
    const offenders = samples.filter((text) => /(?<=[A-Za-z0-9,:] )Scans?\b/.test(text.replace(/[.!?] Scan\b/g, '. ')))
    expect(offenders).toEqual([])
  })

  it('keeps the lowercase sentences the app already shows', () => {
    expect(scanStrings.offline).toBe('Offline: scans are kept and sent when you are back online')
    expect(scanStrings.rejected('x')).toBe("Couldn't sync a scan: x")
  })
})
