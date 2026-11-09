// The offline operation queue (functional spec §10.3). Plain TypeScript, no React.
// Operations are kept in the order they were made, survive a restart (IndexedDB via opStore.ts), and are sent to
// POST /api/scan/sync in that order when the phone is back online. The server is idempotent on clientUuid, so
// sending twice is safe. Stubs until the Developer implements them.
import type { Op, ScanResult } from '../types'

export interface QueuedOp {
  op: Op
  /** RFC 3339 instant the operation entered the queue */
  queuedAt: string
  /** how many sends were tried */
  attempts: number
  /** set when the server rejected it; it stays for the User to see and is never resent */
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
  throw new Error('not implemented')
}

/** A fresh UUID v4 (crypto.randomUUID, with a Math.random fallback where it is missing). */
export function newClientUuid(): string {
  throw new Error('not implemented')
}

export class OfflineQueue {
  constructor(
    private readonly store: OpStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Appends the operation; a clientUuid already in the queue is ignored (no duplicate). */
  enqueue(op: Op): Promise<void> {
    void this.store
    void this.now
    void op
    throw new Error('not implemented')
  }

  /** Operations still to send, in order (rejected ones excluded). */
  pending(): Promise<QueuedOp[]> {
    throw new Error('not implemented')
  }

  /** Operations the server rejected, in order. */
  rejected(): Promise<QueuedOp[]> {
    throw new Error('not implemented')
  }

  /**
   * Sends every pending operation in one call and settles the queue from the results: `applied` and `duplicate`
   * are removed, `rejected` are kept marked. A network error or 5xx keeps everything (attempts +1) and answers
   * offline. Operations enqueued while the call is in flight are untouched. Calls that overlap share one send.
   * With nothing pending the API is not called.
   */
  flush(api: SyncApi): Promise<FlushResult> {
    void api
    throw new Error('not implemented')
  }
}
