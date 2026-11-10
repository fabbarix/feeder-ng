// The offline operation queue (functional spec §10.3). Plain TypeScript, no React.
// Operations are kept in the order they were made, survive a restart (IndexedDB via idbStore.ts), and are sent to
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
 */
export function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** (Math.max(1, attempt) - 1), 30_000)
}

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const isConnectivityError = (err: unknown): boolean =>
  err instanceof ApiError && (err.status === 0 || err.status >= 500)

export class OfflineQueue {
  /** the send under way (shared by every flush asked for meanwhile) */
  private inFlight: Promise<FlushResult> | null = null
  /** the flush asked for while a send is under way: answered by the send that follows it */
  private followUp: Deferred<FlushResult> | null = null
  /**
   * Tail of the queue's lock: every send and every cancel runs after the one before it settles. A send reads the
   * store, sends and writes the outcomes inside its turn, so a cancel never falls in the gap between a read and
   * the batch being known.
   */
  private lock: Promise<unknown> = Promise.resolve()
  /** how the server answered each operation sent in this session */
  private outcomes = new Map<string, 'applied' | 'rejected'>()
  /** notes for rejected operations, kept in memory until dismissed (they are not resent) */
  private notes = new Map<string, QueuedOp>()

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

  /**
   * B6: sets priceCents on the still-queued operation (an edit made offline). true when it was in the queue and
   * changed; false when it already left it (sent, applied or rejected): the caller then uses the server's SetPrice.
   * Runs in the queue's lock, so it never falls between a send's read and its outcome.
   */
  updatePrice(clientUuid: string, priceCents: number): Promise<boolean> {
    return this.exclusive(async () => {
      const queued = (await this.store.all()).find((e) => e.op.clientUuid === clientUuid)
      if (!queued) return false
      await this.store.put({ ...queued, op: { ...queued.op, priceCents } })
      return true
    })
  }

  /** Operations still to send, in order. */
  async pending(): Promise<QueuedOp[]> {
    return this.store.all()
  }

  /** Operations the server rejected in this session, in order, until dismissed. */
  async rejected(): Promise<QueuedOp[]> {
    return [...this.notes.values()]
  }

  /** Forgets the notes of rejected operations (the "N scans couldn't sync" line). */
  dismissRejected(): void {
    this.notes.clear()
  }

  /**
   * Drops an operation the User undid before the server heard of it. Answers true when the server has nothing for
   * it (never sent, so attempts is 0), so there is nothing to undo there; false when it was sent before (attempts
   * > 0: the send failed or timed out, so the server may have applied it), when the server applied it, or when it
   * left the queue because an earlier flush sent it: the caller must ask the server to Undo it. An operation being
   * sent right now is not removed under the send: cancel waits for that send to settle and answers by its outcome.
   */
  cancel(clientUuid: string): Promise<boolean> {
    return this.exclusive(async () => {
      const queued = (await this.store.all()).find((e) => e.op.clientUuid === clientUuid)
      if (queued) {
        await this.store.remove(clientUuid)
        return queued.attempts === 0
      }
      return this.outcomes.get(clientUuid) === 'rejected'
    })
  }

  /** Runs `fn` after every earlier send and cancel has settled, one at a time, in the order asked. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn)
    this.lock = run.catch(() => undefined)
    return run
  }

  /**
   * Sends every pending operation in one call and settles the queue from the results: `applied` and `duplicate`
   * are removed; `rejected` are removed too and kept as a note. A network error or 5xx keeps everything (attempts
   * +1) and answers offline. Operations enqueued while the call is in flight are untouched. A flush asked for while
   * a send is under way is answered by a follow-up send of whatever is pending then (one at most, however many were
   * asked), unless the send found the server unreachable: then there is no immediate follow-up.
   * With nothing pending the API is not called.
   */
  flush(api: SyncApi): Promise<FlushResult> {
    if (this.inFlight) {
      this.followUp ??= deferred<FlushResult>()
      return this.followUp.promise
    }
    this.inFlight = this.runLoop(api).finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  private async runLoop(api: SyncApi): Promise<FlushResult> {
    let waiting: Deferred<FlushResult> | null = null
    try {
      let result = await this.sendExclusive(api)
      while (this.followUp && !result.offline) {
        waiting = this.followUp
        this.followUp = null
        result = await this.sendExclusive(api)
        waiting.resolve(result)
        waiting = null
      }
      if (this.followUp) {
        this.followUp.resolve(result)
        this.followUp = null
      }
      return result
    } catch (err) {
      waiting?.reject(err)
      this.followUp?.reject(err)
      this.followUp = null
      throw err
    }
  }

  private sendExclusive(api: SyncApi): Promise<FlushResult> {
    return this.exclusive(() => this.send(api))
  }

  private async send(api: SyncApi): Promise<FlushResult> {
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
      await this.store.remove(entry.op.clientUuid)
      if (result.status === 'rejected') {
        this.outcomes.set(entry.op.clientUuid, 'rejected')
        this.notes.set(entry.op.clientUuid, {
          ...entry,
          rejected: { code: result.error?.code ?? 'rejected', message: result.error?.message ?? '' },
        })
      } else {
        this.outcomes.set(entry.op.clientUuid, 'applied')
      }
    }
    return { offline: false, results }
  }
}
