// B9-44 (TB-12, decision TB 5): Today shows a "Shopping at <Shop>" tile while this phone has an ACTIVE Scan session: the persisted Scanned
// list belongs to the Household's day, has at least one entry, its last Scan is under 60 minutes old, and Done shopping has not ended it.
// The record gains `lastScanAt` (epoch ms, stamped when a save adds an entry) and `ended`. createSessionStore(db, now?) takes the clock.
import { describe, expect, it, vi } from 'vitest'
import { createMemorySnapshotStore } from './snapshots'
import { ACTIVE_WINDOW_MS, createSessionStore } from './sessionStore'
import { applied, passata } from './scannedList.testData'

const DAY = '2026-11-13'
const T0 = Date.parse('2026-11-13T10:00:00Z')
const MIN = 60_000

function setup() {
  const clock = { t: T0 }
  const db = createMemorySnapshotStore()
  const store = createSessionStore(db, () => clock.t)
  return { clock, db, store }
}

describe('the active window', () => {
  it('is 60 minutes', () => {
    expect(ACTIVE_WINDOW_MS).toBe(60 * MIN)
  })
})

describe('session.active(day): the session Today offers to go back to', () => {
  it('is null with nothing saved', async () => {
    expect(await setup().store.active(DAY)).toBeNull()
  })

  it('names the Shop, the number of Scans and the time of the last Scan', async () => {
    const { store } = setup()
    await store.save(7, DAY, [applied('a', passata), applied('b', passata)])
    expect(await store.active(DAY)).toEqual({ shopId: 7, scanned: 2, lastScanAt: T0 })
  })

  it('is active at 59 minutes and not at 61', async () => {
    const { store, clock } = setup()
    await store.save(7, DAY, [applied('a', passata)])
    clock.t = T0 + 59 * MIN
    expect(await store.active(DAY)).not.toBeNull()
    clock.t = T0 + 61 * MIN
    expect(await store.active(DAY)).toBeNull()
  })

  it('is not active on another Household day, and does not delete the record (reading is not cleaning)', async () => {
    const { store, db } = setup()
    await store.save(7, DAY, [applied('a', passata)])
    expect(await store.active('2026-11-14')).toBeNull()
    expect(await db.get('scan-session')).toBeDefined()
  })

  it('is not active with no entries (the record is gone)', async () => {
    const { store } = setup()
    await store.save(7, DAY, [applied('a', passata)])
    await store.save(7, DAY, [])
    expect(await store.active(DAY)).toBeNull()
  })

  it('a new Scan moves lastScanAt; a save that adds nothing leaves it where it was', async () => {
    const { store, clock } = setup()
    await store.save(7, DAY, [applied('a', passata)])
    clock.t = T0 + 10 * MIN
    await store.save(7, DAY, [applied('a', passata), applied('b', passata)])
    expect((await store.active(DAY))?.lastScanAt).toBe(T0 + 10 * MIN)
    clock.t = T0 + 20 * MIN
    await store.save(7, DAY, [applied('a', passata), applied('b', passata, { priceCents: 129 })])
    expect((await store.active(DAY))?.lastScanAt).toBe(T0 + 10 * MIN)
  })
})

describe('session.end(): Done shopping', () => {
  it('ends the session but keeps the entries, so the Scanned list survives', async () => {
    const { store } = setup()
    const entries = [applied('a', passata), applied('b', passata)]
    await store.save(7, DAY, entries)
    await store.end()
    expect(await store.active(DAY)).toBeNull()
    expect(await store.load(7, DAY)).toEqual(entries)
  })

  it('a new Scan after Done shopping starts an active session again', async () => {
    const { store, clock } = setup()
    await store.save(7, DAY, [applied('a', passata)])
    await store.end()
    clock.t = T0 + 5 * MIN
    await store.save(7, DAY, [applied('a', passata), applied('b', passata)])
    expect(await store.active(DAY)).toMatchObject({ scanned: 2, lastScanAt: T0 + 5 * MIN })
  })

  it('does nothing without a record', async () => {
    await expect(setup().store.end()).resolves.toBeUndefined()
  })
})

describe('session.subscribe(listener): Today hears a change in the same tab', () => {
  it('calls the listener after save, end and clear, until it is removed', async () => {
    const { store } = setup()
    const listener = vi.fn()
    const off = store.subscribe(listener)
    await store.save(7, DAY, [applied('a', passata)])
    await store.end()
    await store.clear()
    expect(listener).toHaveBeenCalledTimes(3)
    off()
    await store.save(7, DAY, [applied('a', passata)])
    expect(listener).toHaveBeenCalledTimes(3)
  })
})
