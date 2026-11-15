// SAFE-01 (B9-18): where reload drafts live. IndexedDB `feeder-drafts` (one object store per editor kind) when it opens; otherwise
// an in-memory store with `persistent: false` (private mode), so an editor never has to care. Drafts older than 7 days are never
// returned: a read removes them.
import { isExpired, type DraftRecord } from './draftDecision'

export type DraftArea = 'recipe' | 'import' | 'receipt'
export const DRAFT_AREAS: readonly DraftArea[] = ['recipe', 'import', 'receipt']

export interface DraftStore {
  get<T>(area: DraftArea, key: string): Promise<DraftRecord<T> | null>
  put<T>(area: DraftArea, key: string, record: DraftRecord<T>): Promise<void>
  remove(area: DraftArea, key: string): Promise<void>
  /** Only that user's drafts, newest first; expired ones are removed. */
  list<T>(area: DraftArea, userId: number): Promise<{ key: string; record: DraftRecord<T> }[]>
  /** Removes every expired draft in every area; answers how many. */
  purge(): Promise<number>
  readonly persistent: boolean
}

/** "<userId>:<record>", e.g. "3:42", "3:new". */
export const draftKey = (userId: number, record: number | string): string => `${userId}:${record}`
const ofUser = (key: string, userId: number) => key.startsWith(`${userId}:`)

/** A plain copy: the editor mutates its own state, so the store never hands out what it keeps. */
const copy = <T,>(v: T): T => structuredClone(v)

/** Every operation over a few primitives, so the memory and IndexedDB stores share the expiry and listing rules. */
interface Backend {
  read(area: DraftArea, key: string): Promise<DraftRecord | undefined>
  write(area: DraftArea, key: string, record: DraftRecord): Promise<void>
  delete(area: DraftArea, key: string): Promise<void>
  entries(area: DraftArea): Promise<[string, DraftRecord][]>
}

function storeOver(backend: Backend, now: () => number, persistent: boolean): DraftStore {
  return {
    persistent,
    async get<T>(area: DraftArea, key: string) {
      const r = await backend.read(area, key)
      if (!r) return null
      if (isExpired(r.savedAt, now())) {
        await backend.delete(area, key)
        return null
      }
      return copy(r) as DraftRecord<T>
    },
    async put<T>(area: DraftArea, key: string, record: DraftRecord<T>) {
      await backend.write(area, key, copy(record) as DraftRecord)
    },
    async remove(area: DraftArea, key: string) {
      await backend.delete(area, key)
    },
    async list<T>(area: DraftArea, userId: number) {
      const out: { key: string; record: DraftRecord<T> }[] = []
      for (const [key, r] of await backend.entries(area)) {
        if (!ofUser(key, userId)) continue
        if (isExpired(r.savedAt, now())) await backend.delete(area, key)
        else out.push({ key, record: copy(r) as DraftRecord<T> })
      }
      return out.sort((a, b) => b.record.savedAt - a.record.savedAt)
    },
    async purge() {
      let n = 0
      for (const area of DRAFT_AREAS) {
        for (const [key, r] of await backend.entries(area)) {
          if (!isExpired(r.savedAt, now())) continue
          await backend.delete(area, key)
          n++
        }
      }
      return n
    },
  }
}

export function createMemoryDraftStore({ now = Date.now }: { now?: () => number } = {}): DraftStore {
  const areas = new Map<DraftArea, Map<string, DraftRecord>>(DRAFT_AREAS.map((a) => [a, new Map()]))
  const of = (area: DraftArea) => areas.get(area)!
  return storeOver(
    {
      read: async (area, key) => of(area).get(key),
      write: async (area, key, record) => void of(area).set(key, record),
      delete: async (area, key) => void of(area).delete(key),
      entries: async (area) => [...of(area).entries()],
    },
    now,
    false,
  )
}

const DB_NAME = 'feeder-drafts'
const DB_VERSION = 1

const request = <T,>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      for (const area of DRAFT_AREAS) if (!req.result.objectStoreNames.contains(area)) req.result.createObjectStore(area)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('feeder-drafts: blocked'))
  })
}

function idbBackend(db: IDBDatabase): Backend {
  const os = (area: DraftArea, mode: IDBTransactionMode) => db.transaction(area, mode).objectStore(area)
  return {
    read: (area, key) => request(os(area, 'readonly').get(key) as IDBRequest<DraftRecord | undefined>),
    write: async (area, key, record) => void (await request(os(area, 'readwrite').put(record, key))),
    delete: async (area, key) => void (await request(os(area, 'readwrite').delete(key))),
    entries: async (area) => {
      const store = os(area, 'readonly')
      const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll() as IDBRequest<DraftRecord[]>)])
      return keys.map((k, i) => [String(k), values[i]!] as [string, DraftRecord])
    },
  }
}

/** IndexedDB when it opens, else a memory store with persistent: false. Never rejects. */
export async function openDraftStore(): Promise<DraftStore> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no IndexedDB')
    return storeOver(idbBackend(await openDb()), Date.now, true)
  } catch {
    return createMemoryDraftStore()
  }
}
