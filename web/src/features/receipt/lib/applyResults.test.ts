// RR4: what the Scanned session does with the apply's `results` (design 7.2 step 5). Pure; the integration wires it to SR3's settle/reprice.
// Pinned API of ./applyResults:
//   splitApplyResults(results: ScanResult[]): { replacements: { replaces: string; result: ScanResult }[]; others: ScanResult[] }
//     A result whose uuid is `receipt:<readId>:undo:<orig>` (with an optional `#n` suffix) REPLACES the scan whose uuid is <orig>.
//     Every other result (new scans: `receipt:<readId>:<n>`, anything else) is in `others`, in the order given.
//   originalUuid(clientUuid): string | undefined       <orig> of an undo uuid, else undefined
import { describe, expect, it } from 'vitest'
import { originalUuid, splitApplyResults } from './applyResults'
import { scanResult } from '../fixtures.test-helper'

describe('originalUuid', () => {
  it.each([
    ['receipt:rd-1:undo:u2', 'u2'],
    ['receipt:rd-1:undo:u2#2', 'u2'],
    ['receipt:rd-1:undo:u2#13', 'u2'],
    ['receipt:abc123:undo:3f2a-77', '3f2a-77'],
  ])('%s -> %s', (uuid, orig) => {
    expect(originalUuid(uuid)).toBe(orig)
  })
  it.each(['receipt:rd-1:0', 'receipt:rd-1:12', 'u1', '', 'receipt:rd-1:undo:', 'xreceipt:rd-1:undo:u2'])('%j is not an undo uuid', (uuid) => {
    expect(originalUuid(uuid)).toBeUndefined()
  })
})

describe('splitApplyResults', () => {
  it('splits the re-keyed scans of a put-back from the new ones', () => {
    const a = scanResult('receipt:rd-1:undo:u2')
    const b = scanResult('receipt:rd-1:undo:u5#2', 89)
    const c = scanResult('receipt:rd-1:0')
    const { replacements, others } = splitApplyResults([a, c, b])
    expect(replacements).toEqual([
      { replaces: 'u2', result: a },
      { replaces: 'u5', result: b },
    ])
    expect(others).toEqual([c])
  })
  it('a 200 with only new scans replaces nothing', () => {
    const r = [scanResult('receipt:rd-1:0'), scanResult('receipt:rd-1:1')]
    expect(splitApplyResults(r)).toEqual({ replacements: [], others: r })
  })
  it('an empty list (a put-back that wrote nothing) is empty', () => {
    expect(splitApplyResults([])).toEqual({ replacements: [], others: [] })
  })
  it('does not mutate its input', () => {
    const r = [scanResult('receipt:rd-1:undo:u2')]
    splitApplyResults(r)
    expect(r).toHaveLength(1)
  })
})
