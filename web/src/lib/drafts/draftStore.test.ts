// B9-18 (SAFE-01 "The reload and crash draft"): lib/drafts/draftStore.ts. IndexedDB `feeder-drafts` in the app; this suite runs the
// in-memory store, which has the same contract (fake-indexeddb is not a dependency, as in the Scan session store's tests).
//
//   type DraftArea = 'recipe' | 'import' | 'receipt'                         one object store per editor kind
//   draftKey(userId: number, record: number | string | 'new'): string        "<userId>:<record>", e.g. "3:42", "3:new"
//   DraftRecord<T> = { draft: T; baseUpdatedAt: string | null; savedAt: number }
//   interface DraftStore {
//     get<T>(area, key): Promise<DraftRecord<T> | null>        never returns one older than DRAFT_MAX_AGE_MS: it removes it and answers null
//     put<T>(area, key, record: DraftRecord<T>): Promise<void>  replaces
//     remove(area, key): Promise<void>                          removing what is not there is fine
//     list<T>(area, userId: number): Promise<{ key: string; record: DraftRecord<T> }[]>   only that user's drafts, newest first, expired ones removed
//     purge(): Promise<number>                                  removes every expired draft, all areas, answers how many
//     readonly persistent: boolean                              false for the in-memory store (IndexedDB missing: private mode)
//   }
//   createMemoryDraftStore({ now?: () => number }): DraftStore
//   openDraftStore(): Promise<DraftStore>                       IndexedDB when it opens, else a memory store with persistent: false (never rejects)
import { describe, expect, it } from 'vitest'
import { DRAFT_MAX_AGE_MS } from './draftDecision'
import { createMemoryDraftStore, draftKey, openDraftStore } from './draftStore'

const DAY = 24 * 60 * 60 * 1000
const rec = (name: string, savedAt: number, baseUpdatedAt: string | null = '2026-11-14T10:00:00Z') => ({ draft: { name }, baseUpdatedAt, savedAt })

describe('draftKey', () => {
  it('is <userId>:<record>', () => {
    expect(draftKey(3, 42)).toBe('3:42')
    expect(draftKey(3, 'new')).toBe('3:new')
  })
})

describe('createMemoryDraftStore', () => {
  const T0 = Date.parse('2026-11-14T16:00:00Z')

  it('starts empty and says it is not persistent', async () => {
    const s = createMemoryDraftStore({ now: () => T0 })
    expect(await s.get('recipe', '3:42')).toBeNull()
    expect(s.persistent).toBe(false)
  })

  it('put then get gives the record back, equal and not the same object (a copy: the editor mutates its own state)', async () => {
    const s = createMemoryDraftStore({ now: () => T0 })
    const r = rec('Lasagne', T0 - 1000)
    await s.put('recipe', '3:42', r)
    const back = await s.get<{ name: string }>('recipe', '3:42')
    expect(back).toEqual(r)
    expect(back).not.toBe(r)
  })

  it('put replaces', async () => {
    const s = createMemoryDraftStore({ now: () => T0 })
    await s.put('recipe', '3:42', rec('One', T0))
    await s.put('recipe', '3:42', rec('Two', T0))
    expect((await s.get<{ name: string }>('recipe', '3:42'))!.draft.name).toBe('Two')
  })

  it('areas are separate', async () => {
    const s = createMemoryDraftStore({ now: () => T0 })
    await s.put('recipe', '3:42', rec('R', T0))
    expect(await s.get('import', '3:42')).toBeNull()
  })

  it('remove deletes it, and removing what is absent is fine', async () => {
    const s = createMemoryDraftStore({ now: () => T0 })
    await s.put('recipe', '3:42', rec('R', T0))
    await s.remove('recipe', '3:42')
    await s.remove('recipe', '3:42')
    expect(await s.get('recipe', '3:42')).toBeNull()
  })

  it('a draft older than 7 days is gone on the next read', async () => {
    let now = T0
    const s = createMemoryDraftStore({ now: () => now })
    await s.put('recipe', '3:42', rec('Old', T0))
    now = T0 + DRAFT_MAX_AGE_MS + 1
    expect(await s.get('recipe', '3:42')).toBeNull()
    now = T0
    expect(await s.get('recipe', '3:42')).toBeNull() // it was removed, not just hidden
  })

  it('list answers one user\'s drafts, newest first, and drops expired ones', async () => {
    let now = T0
    const s = createMemoryDraftStore({ now: () => now })
    await s.put('recipe', '3:new', rec('Lasagne', T0 - 2 * DAY, null))
    await s.put('recipe', '3:42', rec('Pasta', T0 - 1 * DAY))
    await s.put('recipe', '4:new', rec('Someone else', T0 - 1 * DAY, null))
    await s.put('recipe', '3:9', rec('Ancient', T0 - 8 * DAY))
    const list = await s.list<{ name: string }>('recipe', 3)
    expect(list.map((x) => x.key)).toEqual(['3:42', '3:new'])
    expect(list.map((x) => x.record.draft.name)).toEqual(['Pasta', 'Lasagne'])
    expect(await s.get('recipe', '3:9')).toBeNull()
  })

  it('the user id is matched whole: user 3 never sees user 33\'s drafts', async () => {
    const s = createMemoryDraftStore({ now: () => T0 })
    await s.put('recipe', '33:new', rec('Other', T0, null))
    expect(await s.list('recipe', 3)).toEqual([])
  })

  it('purge removes every expired draft in every area and counts them', async () => {
    const s = createMemoryDraftStore({ now: () => T0 })
    await s.put('recipe', '3:1', rec('a', T0 - 8 * DAY))
    await s.put('import', '3:2', rec('b', T0 - 9 * DAY))
    await s.put('receipt', '3:3', rec('c', T0 - 1 * DAY))
    expect(await s.purge()).toBe(2)
    expect(await s.get('receipt', '3:3')).not.toBeNull()
  })
})

describe('openDraftStore without IndexedDB (jsdom, private mode)', () => {
  it('resolves to a working memory store with persistent: false, and never rejects', async () => {
    const s = await openDraftStore()
    expect(s.persistent).toBe(false)
    await s.put('recipe', '3:1', { draft: { name: 'x' }, baseUpdatedAt: null, savedAt: Date.now() })
    expect((await s.get<{ name: string }>('recipe', '3:1'))!.draft.name).toBe('x')
    await s.remove('recipe', '3:1')
  })
})
