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
}

export interface SessionStore {
  /**
   * The entries of this Shop and day. Another day's session is removed and read as empty; another Shop's reads as empty
   * and stays until the next save replaces it.
   */
  load(shopId: number, day: string): Promise<SessionEntry[]>
  /** Replaces the session; no entries removes the record. */
  save(shopId: number, day: string, entries: SessionEntry[]): Promise<void>
  /** Change Shop: removes the record. */
  clear(): Promise<void>
}

export function createSessionStore(db: SnapshotStore): SessionStore {
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
        else await db.set<SessionRecord>(SESSION_KEY, { shopId, day, entries })
      } catch {
        // kept in memory for this visit only
      }
    },
    async clear() {
      try {
        await db.delete(SESSION_KEY)
      } catch {
        // nothing to remove
      }
    },
  }
}

/** The app's session store, on the app's snapshot store. */
export function appSessionStore(): SessionStore {
  return createSessionStore(appSnapshots())
}
