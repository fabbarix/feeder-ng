// SR3: the pure Scanned list (functional spec §10.1; shop-scan-proposals.md §13.2, §13.3, §13.6).
import { describe, expect, it } from 'vitest'
import { makeLine, makeList } from '../../shop/testData'
import {
  buildScannedRows,
  displayOrder,
  dropEntries,
  nextWithoutPrice,
  recordEntry,
  removeTitle,
  repriceEntries,
  rowAmounts,
  rowMeta,
  scannedTotals,
  settleEntries,
  toGetLines,
  type SessionEntry,
} from './scannedList'
import { applied, appliedScan, cheese, okResult, passata, products, queued, scanOp, toiletPaper } from './scannedList.testData'

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`

describe('buildScannedRows: one row per Product', () => {
  it('groups the scans of a Product into one row, ×N, in first-scan order', () => {
    const rows = buildScannedRows(
      [applied('a', passata), applied('b', toiletPaper), applied('c', passata), applied('d', passata)],
      products,
    )
    expect(rows.map((r) => [r.productId, r.count, r.clientUuids])).toEqual([
      [7, 3, ['a', 'c', 'd']],
      [31, 1, ['b']],
    ])
  })

  it('names the row after the server Result, and takes its kind from the Result', () => {
    const [row] = buildScannedRows([applied('a', toiletPaper)], products)
    expect(row).toMatchObject({ key: '31', name: 'Regina toilet paper 9 pieces', kind: 'supply', baseUnit: 'piece', ingredientId: 12 })
  })

  it('reads the kind of a queued scan from the offline Product (H4), and defaults to food', () => {
    const [supply] = buildScannedRows([queued('a', toiletPaper)], products)
    expect(supply?.kind).toBe('supply')
    const bare = { ...passata, ingredientKind: undefined }
    const [food] = buildScannedRows([queued('b', bare)], [bare])
    expect(food?.kind).toBe('food')
  })

  it('shows the Picture of the Product, else its Ingredient\'s', () => {
    const own = applied('a', passata, {}, { productImageUrl: '/api/images/p', ingredientImageUrl: '/api/images/i' })
    const ing = applied('b', toiletPaper, {}, { ingredientImageUrl: '/api/images/i2' })
    const none = applied('c', { ...cheese, imageUrl: undefined })
    const rows = buildScannedRows([own, ing, none], products)
    expect(rows.map((r) => r.imageUrl)).toEqual(['/api/images/p', '/api/images/i2', undefined])
  })

  it('a queued scan uses the offline Product for its name and Picture', () => {
    const [row] = buildScannedRows([queued('a', cheese)], products)
    expect(row).toMatchObject({ name: 'Loose cheese', imageUrl: '/api/images/cheese', waiting: true, pending: true })
  })

  it('a row with only applied scans is neither waiting nor pending', () => {
    const [row] = buildScannedRows([applied('a', passata)], products)
    expect(row).toMatchObject({ waiting: false, pending: false })
  })

  it('a row with applied and queued scans is pending but not waiting', () => {
    const [row] = buildScannedRows([applied('a', passata), queued('b', passata)], products)
    expect(row).toMatchObject({ count: 2, waiting: false, pending: true })
  })

  it('leaves out a scan the server rejected (the row goes away; the notice stays elsewhere)', () => {
    const op = scanOp('a', passata)
    const rejected: SessionEntry = { op, result: { clientUuid: 'a', status: 'rejected', error: { code: 'product_unknown', message: 'gone' } } }
    expect(buildScannedRows([rejected], products)).toEqual([])
    const rows = buildScannedRows([applied('b', passata), rejected], products)
    expect(rows[0]?.count).toBe(1)
  })

  it('counts a duplicate Result like an applied one', () => {
    const op = scanOp('a', passata)
    const dup: SessionEntry = { op, result: { clientUuid: 'a', status: 'duplicate', scan: appliedScan(passata) } }
    expect(buildScannedRows([dup], products)[0]?.count).toBe(1)
  })

  it('a scan that created a new Product (shop_unknown) is a row of its own, keyed by the Product once the Result is in', () => {
    const op = { ...scanOp('n', passata), kind: 'shop_unknown' as const, productId: undefined, productName: 'Eggs 6 pieces', quantity: 6 }
    const waiting = buildScannedRows([{ op, result: null }], products)
    expect(waiting[0]).toMatchObject({ key: 'new:n', productId: null, name: 'Eggs 6 pieces', waiting: true })
    const done = buildScannedRows([{ op, result: okResult(op, passata, { productId: 99, productName: 'Eggs 6 pieces', productCreated: true }) }], products)
    expect(done[0]).toMatchObject({ key: '99', productId: 99 })
  })
})

describe('buildScannedRows: Price', () => {
  it('Price is the latest scan\'s; the row total is Price × count', () => {
    const rows = buildScannedRows([applied('a', passata, { priceCents: 129 }), applied('b', passata, { priceCents: 129 })], products)
    expect(rows[0]).toMatchObject({ priceCents: 129, totalCents: 258, needsPrice: false })
  })

  it('the Result\'s Price wins over the Op\'s (the server is right)', () => {
    const op = scanOp('a', passata, { priceCents: 100 })
    const rows = buildScannedRows([{ op, result: okResult(op, passata, { priceCents: 150 }) }], products)
    expect(rows[0]?.priceCents).toBe(150)
  })

  it('a queued scan uses the Price of its Op', () => {
    const rows = buildScannedRows([queued('a', passata, { priceCents: 129 })], products)
    expect(rows[0]).toMatchObject({ priceCents: 129, needsPrice: false })
  })

  it('a row with no Price needs one, and leaves the total', () => {
    const rows = buildScannedRows([applied('a', passata)], products)
    expect(rows[0]).toMatchObject({ priceCents: null, totalCents: null, needsPrice: true })
  })

  it('a row where any scan has no Price needs one', () => {
    const rows = buildScannedRows([applied('a', passata, { priceCents: 129 }), applied('b', passata)], products)
    expect(rows[0]).toMatchObject({ needsPrice: true, totalCents: null })
  })
})

describe('buildScannedRows: weighed Products', () => {
  const weighedOp = (uuid: string, grams: number, price: number | null = 624) =>
    scanOp(uuid, cheese, { quantity: grams, weighed: true, ...(price === null ? {} : { priceCents: price, pricePerKgCents: 2000 }) })

  it('shows the weight and the Price per kg, and sums the weighed Prices', () => {
    const a = weighedOp('a', 312)
    const b = weighedOp('b', 200, 400)
    const rows = buildScannedRows(
      [
        { op: a, result: okResult(a, cheese) },
        { op: b, result: okResult(b, cheese) },
      ],
      products,
    )
    expect(rows[0]).toMatchObject({ weighed: true, weight: 512, perKgCents: 2000, totalCents: 1024, needsPrice: false })
  })

  it('a weighed scan with no Price needs one', () => {
    const op = weighedOp('a', 312, null)
    const rows = buildScannedRows([{ op, result: okResult(op, cheese) }], products)
    expect(rows[0]).toMatchObject({ weighed: true, weight: 312, perKgCents: null, needsPrice: true })
  })

  it('a scan priced per kg whose quantity is not the pack size is weighed even without the flag (the ask-weight Op)', () => {
    const op = scanOp('a', cheese, { quantity: 312, priceCents: 624, pricePerKgCents: 2000 })
    expect(buildScannedRows([{ op, result: null }], products)[0]?.weighed).toBe(true)
  })

  it('a pack priced per kg whose quantity is the pack size is not weighed', () => {
    const op = scanOp('a', passata, { priceCents: 140, pricePerKgCents: 200 })
    expect(buildScannedRows([{ op, result: null }], products)[0]?.weighed).toBe(false)
  })
})

describe('the Shopping List match of a row', () => {
  it('a ticked Line', () => {
    const [row] = buildScannedRows([applied('a', passata, {}, { onList: true, ticked: true, remaining: 0 })], products)
    expect(row).toMatchObject({ onList: true, ticked: true, remaining: 0 })
  })
  it('a Line with more to get', () => {
    const [row] = buildScannedRows([applied('a', passata, {}, { onList: true, remaining: 700 })], products)
    expect(row).toMatchObject({ onList: true, ticked: false, remaining: 700 })
  })
  it('not on the list', () => {
    const [row] = buildScannedRows([applied('a', passata)], products)
    expect(row).toMatchObject({ onList: false, ticked: false })
  })
  it('a queued scan has no match yet (the badge comes with the Result)', () => {
    const [row] = buildScannedRows([queued('a', passata)], products)
    expect(row).toMatchObject({ onList: false, remaining: null })
  })
  it('the latest applied scan decides', () => {
    const [row] = buildScannedRows(
      [applied('a', passata, {}, { onList: true, remaining: 700 }), applied('b', passata, {}, { onList: true, ticked: true, remaining: 0 })],
      products,
    )
    expect(row).toMatchObject({ ticked: true, remaining: 0 })
  })
})

describe('displayOrder: newest first', () => {
  it('a rescan moves the row to the top', () => {
    const rows = buildScannedRows([applied('a', passata), applied('b', toiletPaper), applied('c', passata)], products)
    expect(rows.map((r) => r.key)).toEqual(['7', '31'])
    expect(displayOrder(rows).map((r) => r.key)).toEqual(['7', '31'])
    const rows2 = buildScannedRows([applied('a', passata), applied('b', toiletPaper)], products)
    expect(displayOrder(rows2).map((r) => r.key)).toEqual(['31', '7'])
  })
  it('does not change the input', () => {
    const rows = buildScannedRows([applied('a', passata), applied('b', toiletPaper)], products)
    displayOrder(rows)
    expect(rows.map((r) => r.key)).toEqual(['7', '31'])
  })
})

describe('scannedTotals', () => {
  it('sums the priced rows and counts the rows still without a Price', () => {
    const rows = buildScannedRows(
      [applied('a', passata, { priceCents: 129 }), applied('b', passata, { priceCents: 129 }), applied('c', toiletPaper, { priceCents: 890 }), applied('d', cheese)],
      products,
    )
    expect(scannedTotals(rows)).toEqual({ spentCents: 1148, unpricedCount: 1 })
  })
  it('is zero with nothing scanned', () => {
    expect(scannedTotals([])).toEqual({ spentCents: 0, unpricedCount: 0 })
  })
  it('counts rows, not scans, without a Price', () => {
    const rows = buildScannedRows([applied('a', passata), applied('b', passata), applied('c', cheese)], products)
    expect(scannedTotals(rows).unpricedCount).toBe(2)
  })
})

describe('nextWithoutPrice', () => {
  const rows = displayOrder(
    buildScannedRows(
      [applied('a', passata), applied('b', toiletPaper, { priceCents: 890 }), applied('c', cheese), applied('d', { ...passata, id: 8, name: 'Barilla pasta' })],
      products,
    ),
  ) // newest first: pasta(8), cheese(21), toilet paper(31), passata(7)

  it('without a current row, the first row without a Price from the top', () => {
    expect(nextWithoutPrice(rows)?.key).toBe('8')
  })
  it('after the current row, going down', () => {
    expect(nextWithoutPrice(rows, '8')?.key).toBe('21')
    expect(nextWithoutPrice(rows, '21')?.key).toBe('7')
  })
  it('wraps to the top when nothing is left below', () => {
    expect(nextWithoutPrice(rows, '7')?.key).toBe('8')
  })
  it('never answers the current row', () => {
    const one = buildScannedRows([applied('a', passata)], products)
    expect(nextWithoutPrice(one, '7')).toBeNull()
  })
  it('is null when every row has a Price', () => {
    expect(nextWithoutPrice(buildScannedRows([applied('a', passata, { priceCents: 1 })], products))).toBeNull()
  })
})

describe('rowMeta: the one-line state of a row (exact copy)', () => {
  const row = (entries: SessionEntry[]) => buildScannedRows(entries, products)[0]!
  it('matched, Line ticked', () => {
    expect(rowMeta(row([applied('a', passata, {}, { onList: true, ticked: true })]), 'metric')).toEqual({ tone: 'success', text: 'On the list · Passata ticked', mark: 'tick' })
  })
  it('matched, more to get', () => {
    expect(rowMeta(row([applied('a', passata, {}, { onList: true, remaining: 700 })]), 'metric')).toEqual({ tone: 'success', text: 'On the list · 700 g still to get', mark: 'outline' })
  })
  it('not on the list', () => {
    expect(rowMeta(row([applied('a', passata)]), 'metric')).toEqual({ tone: 'muted', text: 'Not on the list', mark: null })
  })
  it('waiting to sync', () => {
    expect(rowMeta(row([queued('a', passata)]), 'metric')).toEqual({ tone: 'muted', text: 'Waiting to sync', mark: 'clock' })
  })
  it('weighed, on the list or not', () => {
    const op = scanOp('a', cheese, { quantity: 312, weighed: true })
    expect(rowMeta(row([{ op, result: okResult(op, cheese, { onList: true, remaining: 100 }) }]), 'metric').text).toBe('On the list · 312 g')
    expect(rowMeta(row([{ op, result: okResult(op, cheese) }]), 'metric').text).toBe('312 g')
  })
  it('a Supply counted in pieces', () => {
    expect(rowMeta(row([applied('a', toiletPaper, {}, { onList: true, remaining: 9 })]), 'metric').text).toBe('On the list · 9 pieces still to get')
  })
})

describe('rowAmounts: the value and sub-value of a row (exact copy)', () => {
  const row = (entries: SessionEntry[]) => buildScannedRows(entries, products)[0]!
  it('×1 shows the Price and ×1', () => {
    expect(rowAmounts(row([applied('a', toiletPaper, { priceCents: 890 })]), usd)).toEqual({ value: '$8.90', sub: '×1' })
  })
  it('×N shows the total and ×N · the Price of one', () => {
    expect(rowAmounts(row([applied('a', passata, { priceCents: 129 }), applied('b', passata, { priceCents: 129 })]), usd)).toEqual({ value: '$2.58', sub: '×2 · $1.29' })
  })
  it('no Price shows "Add price" (null value) and the count', () => {
    expect(rowAmounts(row([applied('a', passata)]), usd)).toEqual({ value: null, sub: '×1' })
  })
  it('weighed shows the weighed Price and the Price per kg', () => {
    const op = scanOp('a', cheese, { quantity: 312, weighed: true, priceCents: 624, pricePerKgCents: 2000 })
    expect(rowAmounts(row([{ op, result: okResult(op, cheese) }]), usd)).toEqual({ value: '$6.24', sub: '$20.00/kg' })
  })
  it('a Product in ml says per l', () => {
    const milk = { ...passata, id: 40, baseUnit: 'ml' as const }
    const op = scanOp('a', milk, { quantity: 500, weighed: true, priceCents: 90, pricePerKgCents: 180 })
    expect(rowAmounts(row([{ op, result: okResult(op, milk) }]), usd).sub).toBe('$1.80/l')
  })
})

describe('removeTitle', () => {
  it('names the number of Scans and the Product', () => {
    const row = buildScannedRows([applied('a', { ...passata, name: 'Granarolo mozzarella' }), applied('b', { ...passata, name: 'Granarolo mozzarella' }), applied('c', { ...passata, name: 'Granarolo mozzarella' })], products)[0]!
    expect(removeTitle(row)).toBe('Remove 3 Granarolo mozzarella?')
  })
})

describe('toGetLines: the Shopping List Lines not yet scanned', () => {
  const list = makeList({
    lines: [
      makeLine({ ingredientId: 2, name: 'Passata', quantity: 700, ticked: false }),
      makeLine({ ingredientId: 5, name: 'Cheese', quantity: 200, ticked: false }),
      makeLine({ ingredientId: 9, name: 'Rice', quantity: 0, ticked: true }),
    ],
    extras: [],
  })
  it('leaves out ticked Lines (a scan ticked them)', () => {
    expect(toGetLines(list, []).map((l) => l.name)).toEqual(['Passata', 'Cheese'])
  })
  it('keeps a Line the scans only partly covered', () => {
    const rows = buildScannedRows([applied('a', passata, {}, { onList: true, remaining: 700 })], products)
    expect(toGetLines(list, rows).map((l) => l.name)).toEqual(['Passata', 'Cheese'])
  })
  it('leaves out a Line whose Product is scanned but still waiting to sync (the list has not heard yet)', () => {
    const rows = buildScannedRows([queued('a', passata)], products)
    expect(toGetLines(list, rows).map((l) => l.name)).toEqual(['Cheese'])
  })
  it('is empty without a list', () => {
    expect(toGetLines(undefined, [])).toEqual([])
  })
})

describe('session entry helpers (pure)', () => {
  it('recordEntry appends and answers a new array', () => {
    const before: SessionEntry[] = [applied('a', passata)]
    const after = recordEntry(before, scanOp('b', passata), null)
    expect(after.map((e) => e.op.clientUuid)).toEqual(['a', 'b'])
    expect(before).toHaveLength(1)
  })

  it('settleEntries gives the waiting scans their Results and leaves the others', () => {
    const entries = [queued('a', passata), applied('b', passata), queued('c', toiletPaper)]
    const result = okResult(entries[0]!.op, passata, { onList: true, ticked: true })
    const after = settleEntries(entries, [result])
    expect(after[0]?.result).toBe(result)
    expect(after[1]).toBe(entries[1])
    expect(after[2]?.result).toBeNull()
  })

  it('dropEntries removes scans by uuid', () => {
    const after = dropEntries([applied('a', passata), applied('b', passata), applied('c', cheese)], ['a', 'c'])
    expect(after.map((e) => e.op.clientUuid)).toEqual(['b'])
  })

  it('repriceEntries sets the Price (and Price per kg) on the Op and on the Result', () => {
    const entries = [applied('a', cheese, { quantity: 312, weighed: true }), applied('b', passata)]
    const after = repriceEntries(entries, [{ clientUuid: 'a', priceCents: 624, pricePerKgCents: 2000 }])
    expect(after[0]?.op).toMatchObject({ priceCents: 624, pricePerKgCents: 2000 })
    expect(after[0]?.result?.scan?.priceCents).toBe(624)
    expect(after[1]).toBe(entries[1])
  })

  it('repriceEntries leaves a Price per kg alone when none is given for a pack', () => {
    const [e] = repriceEntries([applied('a', passata)], [{ clientUuid: 'a', priceCents: 129 }])
    expect(e?.op.priceCents).toBe(129)
    expect(e?.op).not.toHaveProperty('pricePerKgCents')
  })
})
