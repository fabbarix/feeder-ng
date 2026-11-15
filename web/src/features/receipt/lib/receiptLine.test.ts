// B9-50 (SSP-08): the "On the receipt" block of the Add… sheet, from the proposal of a Not scanned line. The key is the line as printed,
// the state its price, the detail "×{n} at {price}" (a weighed line: "{weight} at {price}"). Pure.
import { describe, expect, it } from 'vitest'
import { proposal } from '../fixtures.test-helper'
import { receiptLineFor } from './receiptLine'

const money = (c: number) => `$${(c / 100).toFixed(2)}`
const add = (after: Parameters<typeof proposal>[0]['after'], text = 'KITCHEN ROLL 4 PACK') => proposal({ id: 'add:0', kind: 'add', line: 0, text, needsInput: true, after })

describe('receiptLineFor', () => {
  it('one pack: the line as printed, its price, "×1 at $3.49", one Scan', () => {
    expect(receiptLineFor(add({ name: 'Kitchen roll', count: 1, priceCents: 349 }), money)).toEqual({ text: 'KITCHEN ROLL 4 PACK', priceText: '$3.49', detail: '×1 at $3.49', scans: 1 })
  })
  it('two packs say the line total once: "×2 at $17.98", two Scans', () => {
    expect(receiptLineFor(add({ name: 'Olive oil', count: 2, priceCents: 1798 }, 'OLIO'), money)).toEqual({ text: 'OLIO', priceText: '$17.98', detail: '×2 at $17.98', scans: 2 })
  })
  it('a weighed line says its weight as Feeder says amounts, and is one Scan', () => {
    expect(receiptLineFor(add({ name: 'Pane casereccio', grams: 450, priceCents: 225 }, 'PANE CASERECCIO 0,45 kg 2,25'), money)).toEqual({
      text: 'PANE CASERECCIO 0,45 kg 2,25', priceText: '$2.25', detail: '450 g at $2.25', scans: 1,
    })
    expect(receiptLineFor(add({ name: 'Bananas', grams: 1200, priceCents: 180 }, 'BANANE'), money).detail).toBe('1.2 kg at $1.80')
  })
  it('with no price there is no price text and the detail is only the count', () => {
    const out = receiptLineFor(add({ name: 'Kitchen roll', count: 1 }), money)
    expect(out.priceText).toBeUndefined()
    expect(out.detail).toBe('×1')
    expect(out.scans).toBe(1)
  })
  it('a line with neither a count nor a weight is one pack', () => {
    const out = receiptLineFor(add({ name: 'Kitchen roll', priceCents: 349 }), money)
    expect(out.scans).toBe(1)
    expect(out.detail).toBe('×1 at $3.49')
  })
})
