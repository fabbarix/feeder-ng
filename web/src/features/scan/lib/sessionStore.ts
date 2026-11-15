// SR3: the Scanned session kept on the phone: one record, the Shop and household day it belongs to, and its entries
// (spec §10.1 "A reload"). It rides on the app's snapshot store (IndexedDB beside the queue). Nothing here throws:
// a failed read is an empty session, a failed write is kept in memory only.
import { appSnapshots } from './idbStore'
import type { SnapshotStore } from './snapshots'
import type { SessionEntry } from './scannedList'

export const SESSION_KEY = 'scan-session'

interface SessionRecord {
  shopId: number
  day: string
  entries: SessionEntry[]
  /** B9-44 (TB-12): when a save last added an entry (epoch ms). Absent on a record from before beta.9. */
  lastScanAt?: number
  /** B9-44 (TB-12): Done shopping ended the session; the entries stay, so the Scanned list survives. A new Scan clears it. */
  ended?: boolean
}

/** B9-44 (TB-12): a session counts as active on Today for this long after its last Scan. */
export const ACTIVE_WINDOW_MS = 60 * 60_000

/** B9-44 (TB-12): the active session Today offers to go back to. */
export interface ActiveSession {
  shopId: number
  /** How many Scans the Scanned list holds. */
  scanned: number
  lastScanAt: number
}

export interface SessionStore {
  /**
   * The entries of this Shop and day. Another day's session is removed and read as empty; another Shop's reads as empty
   * and stays until the next save replaces it.
   */
  load(shopId: number, day: string): Promise<SessionEntry[]>
  /** Replaces the session; no entries removes the record. A save that adds an entry stamps `lastScanAt` and starts the session again. */
  save(shopId: number, day: string, entries: SessionEntry[]): Promise<void>
  /** Change Shop: removes the record. */
  clear(): Promise<void>
  /**
   * B9-44 (TB-12): the session when it is active: it belongs to the Household's `day`, has an entry, its last Scan is under
   * ACTIVE_WINDOW_MS old and Done shopping has not ended it; else null. Reading never removes anything.
   */
  active(day: string): Promise<ActiveSession | null>
  /** B9-44 (TB-12): Done shopping: ends the session and keeps its entries. */
  end(): Promise<void>
  /** B9-44 (TB-12): called after every save, end and clear (in this tab); returns the function that removes the listener. */
  subscribe(listener: () => void): () => void
}

const entryKey = (e: SessionEntry): string => e.op.clientUuid

export function createSessionStore(db: SnapshotStore, now: () => number = Date.now, listeners: Set<() => void> = new Set()): SessionStore {
  const notify = () => {
    for (const l of [...listeners]) l()
  }
  const read = async (): Promise<SessionRecord | undefined> => {
    try {
      return await db.get<SessionRecord>(SESSION_KEY)
    } catch {
      return undefined
    }
  }
  return {
    async load(shopId, day) {
      try {
        const record = await db.get<SessionRecord>(SESSION_KEY)
        if (record === undefined) return []
        // A malformed record or another household day is stale: removed. Another Shop's record is left in place,
        // because there is only one record and a later save for that Shop replaces it.
        if (!record || !Array.isArray(record.entries) || record.day !== day) {
          await db.delete(SESSION_KEY)
          return []
        }
        if (record.shopId !== shopId) return []
        return record.entries
      } catch {
        return []
      }
    },
    async save(shopId, day, entries) {
      try {
        if (entries.length === 0) await db.delete(SESSION_KEY)
        else {
          const prev = await read()
          const same = prev && Array.isArray(prev.entries) && prev.shopId === shopId && prev.day === day ? prev : undefined
          const known = new Set((same?.entries ?? []).map(entryKey))
          const added = entries.some((e) => !known.has(entryKey(e)))
          const lastScanAt = added || same?.lastScanAt === undefined ? now() : same.lastScanAt
          const ended = added ? false : (same?.ended ?? false)
          await db.set<SessionRecord>(SESSION_KEY, { shopId, day, entries, lastScanAt, ...(ended ? { ended } : {}) })
        }
      } catch {
        // kept in memory for this visit only
      }
      notify()
    },
    async clear() {
      try {
        await db.delete(SESSION_KEY)
      } catch {
        // nothing to remove
      }
      notify()
    },
    async active(day) {
      const record = await read()
      if (!record || !Array.isArray(record.entries) || record.entries.length === 0) return null
      if (record.day !== day || record.ended || typeof record.lastScanAt !== 'number') return null
      if (now() - record.lastScanAt >= ACTIVE_WINDOW_MS) return null
      return { shopId: record.shopId, scanned: record.entries.length, lastScanAt: record.lastScanAt }
    },
    async end() {
      const record = await read()
      if (record) {
        try {
          await db.set<SessionRecord>(SESSION_KEY, { ...record, ended: true })
        } catch {
          // kept as it was
        }
      }
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** Every app session store shares one set of listeners, so Today hears the Scan screen's saves in the same tab. */
const appListeners = new Set<() => void>()

/** The app's session store, on the app's snapshot store. */
export function appSessionStore(): SessionStore {
  return createSessionStore(appSnapshots(), Date.now, appListeners)
}
