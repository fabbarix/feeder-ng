// SR3: the Scanned session kept on the phone, one Shop and household day at a time (spec §10.1 "A reload").
// fake-indexeddb is not a dev dependency, so the store is tested on the memory SnapshotStore the app already uses
// for tests (idbStore.ts's snapshots are the IndexedDB glue); the session store only needs get/set/delete.
import { describe, expect, it } from 'vitest'
import { createMemorySnapshotStore, type SnapshotStore } from './snapshots'
import { createSessionStore, SESSION_KEY } from './sessionStore'
import { applied, passata, queued } from './scannedList.testData'

const DAY = '2026-11-13'

describe('createSessionStore', () => {
  it('keeps the whole session under one key', () => {
    expect(SESSION_KEY).toBe('scan-session')
  })

  it('starts empty', async () => {
    const store = createSessionStore(createMemorySnapshotStore())
    expect(await store.load(1, DAY)).toEqual([])
  })

  it('survives a reload: a new store on the same database gives the entries back, in order', async () => {
    const db = createMemorySnapshotStore()
    const entries = [applied('a', passata, { priceCents: 129 }), queued('b', passata)]
    await createSessionStore(db).save(1, DAY, entries)
    const back = await createSessionStore(db).load(1, DAY)
    expect(back).toEqual(entries)
  })

  it('is empty on a new household day', async () => {
    const db = createMemorySnapshotStore()
    const store = createSessionStore(db)
    await store.save(1, DAY, [applied('a', passata)])
    expect(await store.load(1, '2026-11-14')).toEqual([])
  })

  it('drops yesterday\'s session when it is read on a new day (nothing stale stays on the phone)', async () => {
    const db = createMemorySnapshotStore()
    const store = createSessionStore(db)
    await store.save(1, DAY, [applied('a', passata)])
    await store.load(1, '2026-11-14')
    expect(await db.get(SESSION_KEY)).toBeUndefined()
  })

  it('is empty for another Shop (the session is this Shop\'s)', async () => {
    const store = createSessionStore(createMemorySnapshotStore())
    await store.save(1, DAY, [applied('a', passata)])
    expect(await store.load(2, DAY)).toEqual([])
  })

  it('saving for another Shop replaces the session (one session at a time)', async () => {
    const store = createSessionStore(createMemorySnapshotStore())
    await store.save(1, DAY, [applied('a', passata)])
    await store.save(2, DAY, [applied('b', passata)])
    expect(await store.load(1, DAY)).toEqual([])
    expect((await store.load(2, DAY)).map((e) => e.op.clientUuid)).toEqual(['b'])
  })

  it('clear (Change Shop) empties it, also for the Shop that was left', async () => {
    const store = createSessionStore(createMemorySnapshotStore())
    await store.save(1, DAY, [applied('a', passata)])
    await store.clear()
    expect(await store.load(1, DAY)).toEqual([])
  })

  it('saving an empty list removes the record', async () => {
    const db = createMemorySnapshotStore()
    const store = createSessionStore(db)
    await store.save(1, DAY, [applied('a', passata)])
    await store.save(1, DAY, [])
    expect(await db.get(SESSION_KEY)).toBeUndefined()
  })

  it('never throws: a database that fails reads as empty and writes nothing', async () => {
    const broken: SnapshotStore = {
      get: () => Promise.reject(new Error('idb closed')),
      set: () => Promise.reject(new Error('idb closed')),
      delete: () => Promise.reject(new Error('idb closed')),
    }
    const store = createSessionStore(broken)
    expect(await store.load(1, DAY)).toEqual([])
    await expect(store.save(1, DAY, [applied('a', passata)])).resolves.toBeUndefined()
    await expect(store.clear()).resolves.toBeUndefined()
  })

  it('a record of an unknown shape reads as empty', async () => {
    const db = createMemorySnapshotStore()
    await db.set(SESSION_KEY, { shopId: 1, day: DAY, entries: 'oops' })
    expect(await createSessionStore(db).load(1, DAY)).toEqual([])
  })
})
