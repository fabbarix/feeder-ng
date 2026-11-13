// SR3: a PriceKeypad entry becomes the work of one Price edit for a whole row (spec §10.1 "Price entry";
// shop-scan-proposals.md §13.4 and §13.9; SR1 contract PATCH /api/scan/prices).
import { describe, expect, it } from 'vitest'
import { buildScannedRows } from './scannedList'
import { planPriceEntry, PRICE_REFUSED } from './priceEntry'
import { applied, cheese, okResult, passata, products, queued, scanOp } from './scannedList.testData'

const row = (...entries: Parameters<typeof buildScannedRows>[0]) => buildScannedRows(entries, products)[0]!
const entry = (over: Partial<{ basis: 'pack' | 'perKg'; cents: number | null; packCents: number | null; perKgCents: number | null }> = {}) => ({
  basis: 'pack' as const,
  cents: 145,
  packCents: 145,
  perKgCents: null,
  ...over,
})

describe('planPriceEntry: per pack', () => {
  it('sends the pack Price for every applied scan of the row, in one PATCH body', () => {
    const plan = planPriceEntry(row(applied('a', passata), applied('b', passata)), entry(), 'save')
    expect(plan).toEqual({
      kind: 'save',
      patch: { clientUuids: ['a', 'b'], priceCents: 145 },
      queued: [],
      applied: [
        { clientUuid: 'a', priceCents: 145 },
        { clientUuid: 'b', priceCents: 145 },
      ],
    })
  })

  it('does not send pricePerKgCents for a pack entry', () => {
    const plan = planPriceEntry(row(applied('a', passata)), entry(), 'save')
    expect(plan.kind === 'save' && plan.patch).not.toHaveProperty('pricePerKgCents')
  })
})

describe('planPriceEntry: per kg', () => {
  it('sends the pack Price it implies as priceCents and the Price per kg as pricePerKgCents', () => {
    const plan = planPriceEntry(row(applied('a', passata)), entry({ basis: 'perKg', cents: 200, packCents: 140, perKgCents: 200 }), 'save')
    expect(plan).toMatchObject({ kind: 'save', patch: { clientUuids: ['a'], priceCents: 140, pricePerKgCents: 200 } })
  })

  it('a weighed row: each scan\'s new Price is the weighed amount at the Price per kg, half up', () => {
    const a = scanOp('a', cheese, { quantity: 312, weighed: true })
    const b = scanOp('b', cheese, { quantity: 205, weighed: true })
    const plan = planPriceEntry(
      row({ op: a, result: okResult(a, cheese) }, { op: b, result: okResult(b, cheese) }),
      entry({ basis: 'perKg', cents: 2000, packCents: 2000, perKgCents: 2000 }),
      'save',
    )
    expect(plan.kind === 'save' && plan.applied).toEqual([
      { clientUuid: 'a', priceCents: 624, pricePerKgCents: 2000 },
      { clientUuid: 'b', priceCents: 410, pricePerKgCents: 2000 },
    ])
  })
})

describe('planPriceEntry: scans still waiting in the offline queue', () => {
  it('edits the queue for the queued uuids and keeps them out of the PATCH body (the server has never heard of them: 404)', () => {
    const plan = planPriceEntry(row(applied('a', passata), queued('b', passata)), entry(), 'save')
    expect(plan).toEqual({
      kind: 'save',
      patch: { clientUuids: ['a'], priceCents: 145 },
      queued: [{ clientUuid: 'b', priceCents: 145 }],
      applied: [{ clientUuid: 'a', priceCents: 145 }],
    })
  })

  it('a row that is only queued has no PATCH at all', () => {
    const plan = planPriceEntry(row(queued('a', passata), queued('b', passata)), entry(), 'save')
    expect(plan).toMatchObject({ kind: 'save', patch: null, queued: [{ clientUuid: 'a' }, { clientUuid: 'b' }] })
  })

  it('a queued Price per kg travels with the queued edit', () => {
    const plan = planPriceEntry(
      row(queued('a', cheese, { quantity: 312, weighed: true })),
      entry({ basis: 'perKg', cents: 2000, packCents: 2000, perKgCents: 2000 }),
      'save',
    )
    expect(plan).toMatchObject({ kind: 'save', patch: null, queued: [{ clientUuid: 'a', priceCents: 624, pricePerKgCents: 2000 }] })
  })
})

describe('planPriceEntry: discard and refusal', () => {
  const nulls = { cents: null, packCents: null, perKgCents: null }

  it('Close with nothing typed discards', () => {
    expect(planPriceEntry(row(applied('a', passata)), entry(nulls), 'close')).toEqual({ kind: 'discard' })
  })

  it('Close with an invalid amount (0) discards too', () => {
    expect(planPriceEntry(row(applied('a', passata)), entry({ cents: 0, packCents: 0 }), 'close')).toEqual({ kind: 'discard' })
  })

  it('Close with a valid amount saves it', () => {
    expect(planPriceEntry(row(applied('a', passata)), entry(), 'close').kind).toBe('save')
  })

  it('Save and Next with nothing typed are refused: "Enter a number above 0"', () => {
    expect(PRICE_REFUSED).toBe('Enter a number above 0')
    expect(planPriceEntry(row(applied('a', passata)), entry(nulls), 'save')).toEqual({ kind: 'refuse', error: 'Enter a number above 0' })
    expect(planPriceEntry(row(applied('a', passata)), entry(nulls), 'next')).toEqual({ kind: 'refuse', error: 'Enter a number above 0' })
  })

  it('0 or a negative amount is refused', () => {
    expect(planPriceEntry(row(applied('a', passata)), entry({ cents: 0, packCents: 0 }), 'save').kind).toBe('refuse')
    expect(planPriceEntry(row(applied('a', passata)), entry({ cents: -5, packCents: -5 }), 'save').kind).toBe('refuse')
  })

  it('a per kg entry whose pack Price came out as nothing is refused', () => {
    expect(planPriceEntry(row(applied('a', passata)), entry({ basis: 'perKg', cents: 0, packCents: null, perKgCents: 0 }), 'save').kind).toBe('refuse')
  })

  it('a row with no live scans has nothing to edit and is discarded', () => {
    const empty = { ...row(applied('a', passata)), scans: [], clientUuids: [] }
    expect(planPriceEntry(empty, entry(), 'save')).toEqual({ kind: 'discard' })
  })
})

describe('planPriceEntry: per kg costs every scan as the server does (review)', () => {
  it('a pack scan is costed by its quantity at the Price per kg, not by the typed pack Price', () => {
    // 200/kg × 700 g = 140, whatever pack Price the sheet sent; the PATCH still carries that pack Price
    const plan = planPriceEntry(row(applied('a', passata)), entry({ basis: 'perKg', cents: 200, packCents: 141, perKgCents: 200 }), 'save')
    expect(plan).toMatchObject({ kind: 'save', patch: { priceCents: 141, pricePerKgCents: 200 }, applied: [{ clientUuid: 'a', priceCents: 140, pricePerKgCents: 200 }] })
  })

  it('a weighed scan that would cost less than 1 cent is refused (the server refuses it too)', () => {
    const a = scanOp('a', cheese, { quantity: 2, weighed: true })
    const plan = planPriceEntry(row({ op: a, result: okResult(a, cheese) }), entry({ basis: 'perKg', cents: 100, packCents: 100, perKgCents: 100 }), 'save')
    expect(plan).toEqual({ kind: 'refuse', error: PRICE_REFUSED })
  })

  it('a per kg entry with no Price per kg is not saved as a pack Price', () => {
    expect(planPriceEntry(row(applied('a', passata)), entry({ basis: 'perKg', cents: null, packCents: 145, perKgCents: null }), 'save').kind).toBe('refuse')
  })
})
