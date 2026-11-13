// RR4: the words of a review row and of the notes (docs/design/receipt-reading.md 3.4; mock-ups 15 and 16). Pure.
// Pinned API of ./reviewCopy:
//   changeText(proposal, {money, today}): string        the row's change line, as plain text ("A → B")
//   rowTitle(proposal, rows): string                     the row's name: the Scanned Product, the Add's name, "Shop", "Date"
//   noteTexts(notes, money): string[]                    one sentence per note the review shows, total difference first
//   applyLabel(n): string                                "Apply 6 changes" / "Apply 1 change"
//   appliedToast(n): string                              "Applied 6 changes from the receipt" / "Applied 1 change from the receipt"
//   photosTitle(n): string                               "Photos (2 of up to 4)"
//   photosNotKept(n): string                             "The 2 photos are not kept." / "The photo is not kept."
//   waitingText(n): string                               "Waiting for 2 Scans to sync first" / "Waiting for 1 Scan to sync first"
import { describe, expect, it } from 'vitest'
import { appliedToast, applyLabel, changeText, localDay, noteTexts, photosNotKept, photosTitle, rowTitle, waitingText } from './reviewCopy'
import { add0, add1, date, missing5, name0, packSize1, price0, price1, proposal, quantity4, rows, shop, weight3 } from '../fixtures.test-helper'

const money = (c: number) => `${c < 0 ? '-' : ''}€${(Math.abs(c) / 100).toFixed(2)}`
const o = { money, today: '2026-11-13' }

describe('changeText', () => {
  it('a Price: before to after, per pack', () => {
    expect(changeText(price0, o)).toBe('€1.29 → €1.35 per pack')
  })
  it('a Price that was missing says "Add price"', () => {
    expect(changeText(price1, o)).toBe('Add price → €4.49')
  })
  it('a per kg Price names the kilo', () => {
    const p = proposal({ id: 'price:3', kind: 'price', row: 3, before: { priceCents: 1850, perKg: true }, after: { priceCents: 1990, perKg: true } })
    expect(changeText(p, o)).toBe('€18.50/kg → €19.90/kg')
    expect(changeText({ ...p, before: {} }, o)).toBe('Add price → €19.90/kg')
  })
  it('a Weight: grams to grams with the new Price', () => {
    expect(changeText(weight3, o)).toBe('312 g → 318 g · €6.36')
  })
  it('a Weight over a kilo is shown in kilos', () => {
    const p = proposal({ id: 'weight:3', kind: 'weight', row: 3, before: { grams: 1250 }, after: { grams: 1400, priceCents: 2786 } })
    expect(changeText(p, o)).toBe('1.25 kg → 1.4 kg · €27.86')
  })
  it('a Quantity: counts, and what the receipt has', () => {
    expect(changeText(quantity4, o)).toBe('×3 → ×4 (the receipt has 4)')
  })
  it('a pack size correction', () => {
    expect(changeText(packSize1, o)).toBe('Pack size 9 pieces → 12 pieces')
    const g = proposal({ id: 'pack_size:0', kind: 'pack_size', row: 0, before: { packSize: 700 }, after: { packSize: 500, packUnit: 'g' } })
    expect(changeText(g, o)).toBe('Pack size 700 g → 500 g')
  })
  it('a name correction', () => {
    expect(changeText(name0, o)).toBe('Name Mutti passata 700 g → Mutti passata 500 g')
  })
  it('an Add by weight shows kilos and the Price; by count shows the count', () => {
    expect(changeText(add0, o)).toBe('0.45 kg · €2.25')
    expect(changeText(add1, o)).toBe('1.2 kg · €1.80')
    const n = proposal({ id: 'add:2', kind: 'add', line: 2, needsInput: true, after: { name: 'Sacchetto', count: 2, priceCents: 498, packSize: 20, packUnit: 'piece' } })
    expect(changeText(n, o)).toBe('×2 · €4.98')
  })
  it('a Shop and a date (today is said as "today")', () => {
    expect(changeText(shop, o)).toBe('Shop: Esselunga → Coop')
    expect(changeText(date, o)).toBe('Date: today → Thu 12 Nov')
  })
  it('a date that is not today names both days', () => {
    expect(changeText({ ...date, before: { date: '2026-11-11' } }, o)).toBe('Date: Wed 11 Nov → Thu 12 Nov')
  })
  it('a row not on the receipt says so', () => {
    expect(changeText(missing5, o)).toBe('Not on the receipt')
  })
})

describe('rowTitle', () => {
  it('is the Scanned Product for a row-based proposal', () => {
    expect(rowTitle(price0, rows)).toBe('Mutti passata 700 g')
    expect(rowTitle(weight3, rows)).toBe('Parmigiano Reggiano')
    expect(rowTitle(missing5, rows)).toBe('Monini olive oil 1 l')
  })
  it('is the name of an Add', () => {
    expect(rowTitle(add0, rows)).toBe('Pane casereccio')
  })
  it('is "Shop" and "Date" for those two', () => {
    expect(rowTitle(shop, rows)).toBe('Shop')
    expect(rowTitle(date, rows)).toBe('Date')
  })
  it('falls back to the printed line for an Add without a name', () => {
    expect(rowTitle({ ...add0, after: { grams: 450 } }, rows)).toBe('PANE CASERECCIO 0,45 kg 2,25')
  })
})

describe('noteTexts', () => {
  it('a total below the Scanned list', () => {
    expect(noteTexts([{ code: 'total_differs', text: '', cents: -113 }], money)).toEqual(['The receipt total is €1.13 less than the Scanned list. Check the lines below.'])
  })
  it('a total above it', () => {
    expect(noteTexts([{ code: 'total_differs', text: '', cents: 50 }], money)).toEqual(['The receipt total is €0.50 more than the Scanned list. Check the lines below.'])
  })
  it('a discount is said once and is never spread over Prices', () => {
    const [t] = noteTexts([{ code: 'discount', text: 'SCONTO FEDELTA', cents: -200 }], money)
    expect(t).toContain('€2.00')
    expect(t).toContain('is in the receipt total')
    expect(t).toContain('not spread over Prices')
  })
  it('lists the total difference first, then discounts', () => {
    const t = noteTexts(
      [{ code: 'discount', text: 'SCONTO', cents: -200 }, { code: 'total_differs', text: '', cents: -113 }],
      money,
    )
    expect(t[0]).toMatch(/^The receipt total is/)
    expect(t[1]).toMatch(/discount/i)
  })
  it('an unknown Shop quotes what the receipt printed', () => {
    const [t] = noteTexts([{ code: 'shop_unknown', text: 'COOP CITTA' }], money)
    expect(t).toContain('COOP CITTA')
  })
  it('has nothing to say without notes', () => {
    expect(noteTexts([], money)).toEqual([])
  })
})

describe('counts in words', () => {
  it('applyLabel', () => {
    expect(applyLabel(6)).toBe('Apply 6 changes')
    expect(applyLabel(1)).toBe('Apply 1 change')
    expect(applyLabel(0)).toBe('Apply 0 changes')
  })
  it('appliedToast', () => {
    expect(appliedToast(6)).toBe('Applied 6 changes from the receipt')
    expect(appliedToast(1)).toBe('Applied 1 change from the receipt')
  })
  it('photosTitle', () => {
    expect(photosTitle(2)).toBe('Photos (2 of up to 4)')
    expect(photosTitle(0)).toBe('Photos (0 of up to 4)')
  })
  it('localDay is the calendar day in the phone\'s zone', () => {
    expect(localDay(new Date(2026, 10, 3, 23, 59))).toBe('2026-11-03')
  })
  it('photosNotKept', () => {
    expect(photosNotKept(2)).toBe('The 2 photos are not kept.')
    expect(photosNotKept(1)).toBe('The photo is not kept.')
  })
  it('waitingText', () => {
    expect(waitingText(2)).toBe('Waiting for 2 Scans to sync first')
    expect(waitingText(1)).toBe('Waiting for 1 Scan to sync first')
  })
})
