// The offline operation queue (functional spec §10.3). Plain TypeScript, no React.
// Operations are kept in the order they were made, survive a restart (IndexedDB via opStore.ts), and are sent to
// POST /api/scan/sync in that order when the phone is back online. The server is idempotent on clientUuid, so
// sending twice is safe. Stubs until the Developer implements them.
import { ApiError } from '../../../lib/http'
import type { Op, ScanResult } from '../types'

export interface QueuedOp {
  op: Op
  /** RFC 3339 instant the operation entered the queue */
  queuedAt: string
  /** how many sends were tried */
  attempts: number
  /**
   * set on the notes kept in memory for operations the server rejected (see OfflineQueue.rejected). A rejected
   * operation is removed from the OpStore (IndexedDB) at once and never resent; the note lives until dismissed.
   */
  rejected?: { code: string; message: string }
}

/** Ordered persistent storage. all() returns entries in the order they were appended. */
export interface OpStore {
  append(entry: QueuedOp): Promise<void>
  all(): Promise<QueuedOp[]>
  put(entry: QueuedOp): Promise<void>
  remove(clientUuid: string): Promise<void>
}

export interface SyncApi {
  sync(ops: Op[]): Promise<ScanResult[]>
}

export interface FlushResult {
  /** the server was unreachable (network error or 5xx); everything stays queued */
  offline: boolean
  results: ScanResult[]
}

export function createMemoryOpStore(): OpStore {
  const entries = new Map<string, QueuedOp>()
  const copy = (e: QueuedOp): QueuedOp => ({ ...e, op: { ...e.op }, rejected: e.rejected ? { ...e.rejected } : undefined })
  return {
    async append(entry) {
      entries.set(entry.op.clientUuid, copy(entry))
    },
    async all() {
      return [...entries.values()].map(copy)
    },
    async put(entry) {
      entries.set(entry.op.clientUuid, copy(entry))
    },
    async remove(clientUuid) {
      entries.delete(clientUuid)
    },
  }
}

/** A fresh UUID v4 (crypto.randomUUID, with a Math.random fallback where it is missing). */
export function newClientUuid(): string {
  const c = globalThis.crypto as Partial<Crypto> | undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/**
 * How long to wait before the next automatic send after `attempt` failed ones in a row while the phone thinks it
 * is online (network error or 5xx): 1 s, 2 s, 4 s, 8 s, 16 s, then 30 s every time. attempt < 1 counts as 1.
 * Stub until the Developer implements it.
 */
export function backoffMs(_attempt: number): number {
  return 0
}

const isConnectivityError = (err: unknown): boolean =>
  err instanceof ApiError && (err.status === 0 || err.status >= 500)

export class OfflineQueue {
  private inFlight: Promise<FlushResult> | null = null

  constructor(
    private readonly store: OpStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Appends the operation; a clientUuid already in the queue is ignored (no duplicate). */
  async enqueue(op: Op): Promise<void> {
    const existing = await this.store.all()
    if (existing.some((e) => e.op.clientUuid === op.clientUuid)) return
    await this.store.append({ op, queuedAt: this.now().toISOString(), attempts: 0 })
  }

  /** Operations still to send, in order (rejected ones excluded). */
  async pending(): Promise<QueuedOp[]> {
    return (await this.store.all()).filter((e) => !e.rejected)
  }

  /** Operations the server rejected, in order. */
  async rejected(): Promise<QueuedOp[]> {
    return (await this.store.all()).filter((e) => e.rejected)
  }

  /**
   * Drops an operation the User undid before the server heard of it. Answers true when the server has nothing for
   * it (it was still waiting, or its send failed, or the server rejected it), so there is nothing to undo there;
   * false when the server applied it (applied or duplicate), or it is no longer in the queue because an earlier
   * flush sent it: the caller must ask the server to Undo it. An operation that is being sent right now is not
   * removed under the send: cancel waits for that send to finish and then answers by its outcome, so the Undo is
   * never lost. Stub: the Developer implements the in-flight case.
   */
  async cancel(clientUuid: string): Promise<boolean> {
    const existing = (await this.store.all()).find((e) => e.op.clientUuid === clientUuid)
    if (!existing) return false
    await this.store.remove(clientUuid)
    return true
  }

  /** Forgets the notes of rejected operations (the "N scans couldn't sync" line). Stub. */
  dismissRejected(): void {}

  /**
   * Sends every pending operation in one call and settles the queue from the results: `applied` and `duplicate`
   * are removed, `rejected` are kept marked. A network error or 5xx keeps everything (attempts +1) and answers
   * offline. Operations enqueued while the call is in flight are untouched. Calls that overlap share one send.
   * With nothing pending the API is not called.
   */
  flush(api: SyncApi): Promise<FlushResult> {
    if (!this.inFlight) {
      this.inFlight = this.run(api).finally(() => {
        this.inFlight = null
      })
    }
    return this.inFlight
  }

  private async run(api: SyncApi): Promise<FlushResult> {
    const sent = await this.pending()
    if (sent.length === 0) return { offline: false, results: [] }
    let results: ScanResult[]
    try {
      results = await api.sync(sent.map((e) => e.op))
    } catch (err) {
      if (!isConnectivityError(err)) throw err
      for (const entry of sent) await this.store.put({ ...entry, attempts: entry.attempts + 1 })
      return { offline: true, results: [] }
    }
    for (const result of results) {
      const entry = sent.find((e) => e.op.clientUuid === result.clientUuid)
      if (!entry) continue
      if (result.status === 'rejected') {
        await this.store.put({ ...entry, rejected: { code: result.error?.code ?? 'rejected', message: result.error?.message ?? '' } })
      } else {
        await this.store.remove(entry.op.clientUuid)
      }
    }
    return { offline: false, results }
  }
}
