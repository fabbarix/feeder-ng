// b8-rxweb: the background receipt read (docs/design/receipt-reading.md 3.3; docs/dev/design/b8-rxweb.md). The read belongs to the app,
// not to the photos screen: it goes on when the User leaves, and the Scan screen's row and a toast say when it is done. Plain TypeScript,
// module-level state, no React. One read at a time (the server allows one running read per User).
// Nothing here ever stores a photo; the entry in sessionStorage holds ids and times only.
import { ApiError } from '../../../lib/http'
import { receiptApi } from '../api'
import type { ReadDone, ReadView, ReceiptErrorInput, ReceiptSession } from '../types'
import { failureOf, POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from './readPolling'
import { forgetRead, READ_KEPT_MS, rememberRead } from './readStore'

export const BACKGROUND_READ_KEY = 'feeder.receipt.read'

export type BackgroundRead =
  | { status: 'reading'; shopId: number; startedAt: number; readId?: string; connectionLost: boolean }
  | { status: 'ready'; shopId: number; readId: string; changes: number }
  | { status: 'failed'; shopId: number; error: ReceiptErrorInput }

/** What a listener of the finish hears: a read is ready or failed. */
export type FinishedRead = Exclude<BackgroundRead, { status: 'reading' }>

interface Entry {
  shopId: number
  readId: string
  clientUuids: string[]
  startedAt: number
  finishedAt?: number
}

/** The read in progress. `resumed` is a read picked up after a reload: a 404 then is dropped silently. */
interface Run {
  shopId: number
  clientUuids: string[]
  startedAt: number
  readId?: string
  resumed: boolean
  inFlight: boolean
  poll?: ReturnType<typeof setInterval>
  timeout?: ReturnType<typeof setTimeout>
  firstPoll?: ReturnType<typeof setTimeout>
}

/** Frees the server's slot for a read this phone will not poll: a failed DELETE changes nothing (the job ends on its own). */
async function freeSlot(readId: string): Promise<void> {
  try {
    await receiptApi.cancelRead(readId)
  } catch {
    // the server's job ends by itself within its own cap
  }
}

const listeners = new Set<() => void>()
const finishedListeners = new Set<(s: FinishedRead) => void>()

let state: BackgroundRead | undefined
let run: Run | undefined
/** The Scanned list of the read in hand, for the screens the watcher opens. */
let owner: ReceiptSession | undefined
let expiry: ReturnType<typeof setTimeout> | undefined

function setState(next: BackgroundRead | undefined): void {
  state = next
  for (const listener of [...listeners]) listener()
}

function finish(next: FinishedRead): void {
  setState(next)
  for (const listener of [...finishedListeners]) listener(next)
}

function stopRun(r: Run | undefined): void {
  if (r === undefined) return
  if (r.poll !== undefined) clearInterval(r.poll)
  if (r.timeout !== undefined) clearTimeout(r.timeout)
  if (r.firstPoll !== undefined) clearTimeout(r.firstPoll)
  if (run === r) run = undefined
}

function clearExpiry(): void {
  if (expiry !== undefined) clearTimeout(expiry)
  expiry = undefined
}

function writeEntry(entry: Entry): void {
  try {
    sessionStorage.setItem(BACKGROUND_READ_KEY, JSON.stringify(entry))
  } catch {
    // storage may be blocked: the read works without surviving a reload
  }
}

function clearEntry(): void {
  try {
    sessionStorage.removeItem(BACKGROUND_READ_KEY)
  } catch {
    // nothing to clear when storage is blocked
  }
}

function readEntry(): Entry | undefined {
  try {
    const raw = sessionStorage.getItem(BACKGROUND_READ_KEY)
    if (raw === null) return undefined
    const v = JSON.parse(raw) as Partial<Entry> | null
    if (!v || typeof v.shopId !== 'number' || typeof v.readId !== 'string' || !Array.isArray(v.clientUuids) || typeof v.startedAt !== 'number') {
      return undefined
    }
    const clientUuids = v.clientUuids.filter((u): u is string => typeof u === 'string')
    return { shopId: v.shopId, readId: v.readId, clientUuids, startedAt: v.startedAt, ...(typeof v.finishedAt === 'number' ? { finishedAt: v.finishedAt } : {}) }
  } catch {
    return undefined
  }
}

function readingOf(r: Run, connectionLost: boolean): BackgroundRead {
  return {
    status: 'reading',
    shopId: r.shopId,
    startedAt: r.startedAt,
    connectionLost,
    ...(r.readId !== undefined ? { readId: r.readId } : {}),
  }
}

/** When the run must end: 150 s after its start, or, for a finished read picked up after a reload, when the server stops keeping it. */
function deadlineOf(startedAt: number, finishedAt?: number): number {
  return finishedAt !== undefined ? finishedAt + READ_KEPT_MS : startedAt + POLL_TIMEOUT_MS
}

function scheduleExpiry(ms: number): void {
  clearExpiry()
  expiry = setTimeout(() => {
    expiry = undefined
    if (state?.status !== 'ready') return
    forgetRead()
    clearEntry()
    setState(undefined)
  }, ms)
}

function setConnection(r: Run, lost: boolean): void {
  if (run !== r || state?.status !== 'reading' || state.connectionLost === lost) return
  setState({ ...state, connectionLost: lost })
}

function endWithFailure(r: Run, error: ReceiptErrorInput, cancelOnServer: boolean): void {
  stopRun(r)
  clearEntry()
  forgetRead()
  if (cancelOnServer && r.readId !== undefined) void freeSlot(r.readId)
  finish({ status: 'failed', shopId: r.shopId, error })
}

function endReady(r: Run, readId: string, view: ReadDone): void {
  stopRun(r)
  const finishedAt = Date.now()
  rememberRead({ readId, shopId: r.shopId, clientUuids: r.clientUuids, read: view }, finishedAt)
  writeEntry({ shopId: r.shopId, readId, clientUuids: r.clientUuids, startedAt: r.startedAt, finishedAt })
  scheduleExpiry(READ_KEPT_MS)
  finish({ status: 'ready', shopId: r.shopId, readId, changes: view.proposals.length })
}

function giveUp(r: Run): void {
  if (run !== r) return
  endWithFailure(r, { code: 'timeout' }, true)
}

async function pollRun(r: Run): Promise<void> {
  if (r.inFlight || run !== r || r.readId === undefined) return
  r.inFlight = true
  const readId = r.readId
  try {
    const view: ReadView = await receiptApi.getRead(readId)
    if (run !== r) return
    if (view.status === 'running') {
      setConnection(r, false)
      return
    }
    if (view.status === 'done') {
      endReady(r, readId, view)
      return
    }
    endWithFailure(r, view.error.retryAfterSeconds !== undefined ? { code: view.error.code, retryAfterSeconds: view.error.retryAfterSeconds } : { code: view.error.code }, false)
  } catch (err) {
    if (run !== r) return
    if (err instanceof ApiError && err.status === 0) {
      setConnection(r, true)
      return
    }
    if (err instanceof ApiError && err.status === 404 && r.resumed) {
      // The server no longer keeps it, and the User has not asked for anything: nothing to say.
      stopRun(r)
      clearEntry()
      setState(undefined)
      return
    }
    endWithFailure(r, err instanceof ApiError && err.status === 404 ? { code: 'receipt_read_gone' } : failureOf(err), false)
  } finally {
    r.inFlight = false
  }
}

/** Starts the one read: the photos go to the server, the read goes on without the screen. A second start while one reads does nothing. */
export async function startBackgroundRead(session: ReceiptSession, photos: { dataUrl: string }[]): Promise<void> {
  if (run !== undefined) return
  const r: Run = { shopId: session.shopId, clientUuids: [...session.clientUuids], startedAt: Date.now(), resumed: false, inFlight: false }
  run = r
  owner = { shopId: r.shopId, clientUuids: [...r.clientUuids] }
  clearExpiry()
  forgetRead()
  setState(readingOf(r, false))
  let started: { id: string }
  try {
    started = await receiptApi.startRead({ shopId: session.shopId, clientUuids: session.clientUuids, photos })
  } catch (err) {
    if (run !== r) return
    stopRun(r)
    clearEntry()
    finish({ status: 'failed', shopId: r.shopId, error: failureOf(err) })
    return
  }
  if (run !== r) {
    // Cancelled while the POST was on its way: free the slot the server took.
    void freeSlot(started.id)
    return
  }
  r.readId = started.id
  writeEntry({ shopId: r.shopId, readId: started.id, clientUuids: r.clientUuids, startedAt: r.startedAt })
  setState(readingOf(r, false))
  r.poll = setInterval(() => void pollRun(r), POLL_INTERVAL_MS)
  r.timeout = setTimeout(() => giveUp(r), Math.max(0, deadlineOf(r.startedAt) - Date.now()))
}

/** Stops the read: polling ends, the slot is freed with a DELETE when the server has the read, and the state goes. Announces nothing. */
export async function cancelBackgroundRead(): Promise<void> {
  const r = run
  stopRun(r)
  clearExpiry()
  clearEntry()
  forgetRead()
  setState(undefined)
  if (r?.readId !== undefined) await freeSlot(r.readId)
}

/** Clears a ready or failed read. A ready one also forgets the kept read (the server keeps it its 10 minutes). Does nothing while one reads. */
export function dismissBackgroundRead(): void {
  if (state === undefined || state.status === 'reading') return
  if (state.status === 'ready') forgetRead()
  clearExpiry()
  clearEntry()
  setState(undefined)
}

export function getBackgroundRead(): BackgroundRead | undefined {
  return state
}

/** The Scanned list of the read in hand (the watcher publishes it before it opens a screen). */
export function backgroundReadSession(): ReceiptSession | undefined {
  return owner
}

export function subscribeBackgroundRead(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Called once per read when it is ready or failed. Not after a cancel. */
export function onBackgroundReadFinished(listener: (s: FinishedRead) => void): () => void {
  finishedListeners.add(listener)
  return () => {
    finishedListeners.delete(listener)
  }
}

/** After a reload: picks up the read the session entry names. A read that is too old is dropped without asking the server. */
export async function resumeBackgroundRead(now: number = Date.now()): Promise<void> {
  if (run !== undefined || state !== undefined) return
  const entry = readEntry()
  if (!entry) return
  if (now >= deadlineOf(entry.startedAt, entry.finishedAt)) {
    clearEntry()
    return
  }
  const r: Run = { shopId: entry.shopId, clientUuids: entry.clientUuids, startedAt: entry.startedAt, readId: entry.readId, resumed: true, inFlight: false }
  run = r
  owner = { shopId: r.shopId, clientUuids: [...r.clientUuids] }
  setState(readingOf(r, false))
  r.poll = setInterval(() => void pollRun(r), POLL_INTERVAL_MS)
  r.timeout = setTimeout(() => giveUp(r), Math.max(0, deadlineOf(entry.startedAt, entry.finishedAt) - now))
  r.firstPoll = setTimeout(() => {
    r.firstPoll = undefined
    void pollRun(r)
  }, 0)
}

/** Stops every timer and clears the state, the storage entry and the kept read (tests, sign-out). */
export function resetBackgroundRead(): void {
  stopRun(run)
  clearExpiry()
  clearEntry()
  forgetRead()
  owner = undefined
  setState(undefined)
}
