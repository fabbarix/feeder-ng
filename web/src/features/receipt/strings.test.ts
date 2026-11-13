// RR4: the receipt feature's words (GLOSSARY: never a word under _Avoid_). Pinned: ./strings exports `receiptStrings`, an object of strings and
// functions returning strings (nested allowed); this walks every value (functions are called with 1, then 2).
import { describe, expect, it } from 'vitest'
import { receiptStrings } from './strings'

function collect(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (typeof v === 'function') {
    for (const args of [[1], [2]]) {
      const r = (v as (...a: unknown[]) => unknown)(...args)
      if (typeof r === 'string') out.push(r)
    }
  } else if (v && typeof v === 'object') for (const x of Object.values(v)) collect(x, out)
  return out
}
// GLOSSARY.md _Avoid_ lists for Receipt, Receipt review, Scanned list (and the Scan terms around them).
const AVOID = ['bill', 'till slip', 'invoice', 'ticket', 'scontrino', 'receipt import', 'receipt check', 'receipt confirmation', 'basket', 'cart', 'trolley']

describe('receiptStrings', () => {
  const all = collect(receiptStrings)
  it('has words', () => {
    expect(all.length).toBeGreaterThan(20)
  })
  it.each(AVOID)('never says "%s"', (word) => {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    expect(all.filter((s) => re.test(s))).toEqual([])
  })
  it('carries the copy the design fixes', () => {
    for (const s of ['Read the receipt', 'Fill in Prices and weights from a photo', 'Take a photo', 'Add another photo', 'Reading the receipt…', 'Review the receipt', 'Nothing changes until you apply.', 'Accept all', 'Clear all', 'Add…', 'Leave without applying?'])
      expect(all).toContain(s)
  })
})
