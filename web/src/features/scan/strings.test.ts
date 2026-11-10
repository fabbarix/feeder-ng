import { describe, expect, it } from 'vitest'
import { scanStrings } from './strings'

// R10: Scan is a GLOSSARY term, capitalised in every count.
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
