// SR3: the Scanned list as React state, persisted in the session store (spec §10.1; shop-scan-proposals.md §13.2, §13.7).
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeLine, makeList } from '../../shop/testData'
import { createMemorySnapshotStore } from '../lib/snapshots'
import { createSessionStore } from '../lib/sessionStore'
import { applied, cheese, okResult, passata, products, scanOp, toiletPaper } from '../lib/scannedList.testData'
import type { OfflineData } from '../types'
import { useScannedList, type UseScannedListOptions } from './useScannedList'

const offline: OfflineData = { shopId: 1, shopName: 'Coop', catalog: { globalBarcodes: {}, weightRules: [], weightProducts: {} }, products }
const list = makeList({ lines: [makeLine({ ingredientId: 2, name: 'Passata', quantity: 700 }), makeLine({ ingredientId: 5, name: 'Cheese', quantity: 200 })], extras: [] })

function setup(over: Partial<UseScannedListOptions> = {}, db = createMemorySnapshotStore()) {
  const store = createSessionStore(db)
  const options: UseScannedListOptions = { shopId: 1, day: '2026-11-13', store, offline, list, system: 'metric', ...over }
  const hook = renderHook((props: UseScannedListOptions) => useScannedList(props), { initialProps: options })
  return { db, store, hook, options }
}

describe('useScannedList', () => {
  it('starts empty, then loaded', async () => {
    const { hook } = setup()
    await waitFor(() => expect(hook.result.current.loaded).toBe(true))
    expect(hook.result.current.rows).toEqual([])
    expect(hook.result.current.totals).toEqual({ spentCents: 0, unpricedCount: 0 })
  })

  it('records a scan: a row, newest first, with the total and the rows without a Price', async () => {
    const { hook } = setup()
    await waitFor(() => expect(hook.result.current.loaded).toBe(true))
    const a = applied('a', passata, { priceCents: 129 })
    const b = applied('b', toiletPaper)
    act(() => hook.result.current.record(a.op, a.result))
    act(() => hook.result.current.record(b.op, b.result))
    expect(hook.result.current.rows.map((r) => r.key)).toEqual(['31', '7'])
    expect(hook.result.current.totals).toEqual({ spentCents: 129, unpricedCount: 1 })
  })

  it('a rescan makes ×2 and moves the row to the top', async () => {
    const { hook } = setup()
    await waitFor(() => expect(hook.result.current.loaded).toBe(true))
    for (const e of [applied('a', passata), applied('b', toiletPaper), applied('c', passata)]) act(() => hook.result.current.record(e.op, e.result))
    expect(hook.result.current.rows.map((r) => [r.key, r.count])).toEqual([['7', 2], ['31', 1]])
  })

  it('settle gives a waiting scan its Result', async () => {
    const { hook } = setup()
    await waitFor(() => expect(hook.result.current.loaded).toBe(true))
    const op = scanOp('a', passata)
    act(() => hook.result.current.record(op, null))
    expect(hook.result.current.rows[0]?.waiting).toBe(true)
    act(() => hook.result.current.settle([okResult(op, passata, { onList: true, ticked: true })]))
    expect(hook.result.current.rows[0]).toMatchObject({ waiting: false, onList: true, ticked: true })
  })

  it('a rejected Result takes the row away', async () => {
    const { hook } = setup()
    await waitFor(() => expect(hook.result.current.loaded).toBe(true))
    const op = scanOp('a', passata)
    act(() => hook.result.current.record(op, null))
    act(() => hook.result.current.settle([{ clientUuid: 'a', status: 'rejected', error: { code: 'x', message: 'no' } }]))
    expect(hook.result.current.rows).toEqual([])
  })

  it('drop removes scans; reprice sets Prices', async () => {
    const { hook } = setup()
    await waitFor(() => expect(hook.result.current.loaded).toBe(true))
    for (const e of [applied('a', passata), applied('b', passata)]) act(() => hook.result.current.record(e.op, e.result))
    act(() => hook.result.current.reprice([{ clientUuid: 'a', priceCents: 129 }, { clientUuid: 'b', priceCents: 129 }]))
    expect(hook.result.current.rows[0]).toMatchObject({ totalCents: 258, needsPrice: false })
    act(() => hook.result.current.drop(['a']))
    expect(hook.result.current.rows[0]?.count).toBe(1)
  })

  it('next answers the next row without a Price below the current one, then wraps', async () => {
    const { hook } = setup()
    await waitFor(() => expect(hook.result.current.loaded).toBe(true))
    for (const e of [applied('a', passata), applied('b', toiletPaper, { priceCents: 890 }), applied('c', cheese)]) act(() => hook.result.current.record(e.op, e.result))
    // newest first: cheese, toilet paper, passata
    expect(hook.result.current.nextUnpriced()?.key).toBe('21')
    expect(hook.result.current.nextUnpriced('21')?.key).toBe('7')
    expect(hook.result.current.nextUnpriced('7')?.key).toBe('21')
  })

  it('"To get" is the open Lines, and a scan still waiting to sync takes its Line off', async () => {
    const { hook } = setup()
    await waitFor(() => expect(hook.result.current.loaded).toBe(true))
    expect(hook.result.current.toGet.map((l) => l.name)).toEqual(['Passata', 'Cheese'])
    expect(hook.result.current.toGetCount).toBe(2)
    act(() => hook.result.current.record(scanOp('a', passata), null))
    expect(hook.result.current.toGet.map((l) => l.name)).toEqual(['Cheese'])
    expect(hook.result.current.toGetCount).toBe(1)
  })

  it('persists every change, and a remount of the same Shop and day brings the rows back', async () => {
    const first = setup()
    await waitFor(() => expect(first.hook.result.current.loaded).toBe(true))
    const a = applied('a', passata, { priceCents: 129 })
    act(() => first.hook.result.current.record(a.op, a.result))
    await waitFor(async () => expect((await first.store.load(1, '2026-11-13')).length).toBe(1))
    first.hook.unmount()
    const second = setup({}, first.db)
    await waitFor(() => expect(second.hook.result.current.loaded).toBe(true))
    expect(second.hook.result.current.rows.map((r) => [r.key, r.count, r.priceCents])).toEqual([['7', 1, 129]])
  })

  it('starts empty on a new household day', async () => {
    const first = setup()
    await waitFor(() => expect(first.hook.result.current.loaded).toBe(true))
    const a = applied('a', passata)
    act(() => first.hook.result.current.record(a.op, a.result))
    await waitFor(async () => expect((await first.store.load(1, '2026-11-13')).length).toBe(1))
    first.hook.unmount()
    const next = setup({ day: '2026-11-14' }, first.db)
    await waitFor(() => expect(next.hook.result.current.loaded).toBe(true))
    expect(next.hook.result.current.rows).toEqual([])
  })

  it('starts empty for another Shop', async () => {
    const first = setup()
    await waitFor(() => expect(first.hook.result.current.loaded).toBe(true))
    const a = applied('a', passata)
    act(() => first.hook.result.current.record(a.op, a.result))
    await waitFor(async () => expect((await first.store.load(1, '2026-11-13')).length).toBe(1))
    first.hook.unmount()
    const other = setup({ shopId: 2 }, first.db)
    await waitFor(() => expect(other.hook.result.current.loaded).toBe(true))
    expect(other.hook.result.current.rows).toEqual([])
  })

  it('clear (Change Shop) empties the rows and the stored session', async () => {
    const { hook, store } = setup()
    await waitFor(() => expect(hook.result.current.loaded).toBe(true))
    const a = applied('a', passata)
    act(() => hook.result.current.record(a.op, a.result))
    await act(async () => hook.result.current.clear())
    expect(hook.result.current.rows).toEqual([])
    expect(await store.load(1, '2026-11-13')).toEqual([])
  })

  it('a scan made before the stored session has loaded is not lost', async () => {
    const db = createMemorySnapshotStore()
    await createSessionStore(db).save(1, '2026-11-13', [applied('old', passata)])
    const { hook } = setup({}, db)
    const b = applied('new', toiletPaper)
    act(() => hook.result.current.record(b.op, b.result))
    await waitFor(() => expect(hook.result.current.loaded).toBe(true))
    expect(hook.result.current.rows.map((r) => r.key).sort()).toEqual(['31', '7'])
  })

  it('without a household day yet (the list has not loaded), nothing is read or written', async () => {
    const { hook, db } = setup({ day: null })
    expect(hook.result.current.loaded).toBe(false)
    const a = applied('a', passata)
    act(() => hook.result.current.record(a.op, a.result))
    expect(hook.result.current.rows).toHaveLength(1)
    expect(await db.get('scan-session')).toBeUndefined()
  })
})
