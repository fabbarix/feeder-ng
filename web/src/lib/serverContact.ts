// B9-49 (RES-07): the newest successful server answer, recorded by the HTTP client (lib/http.ts) and kept on the device so a cold
// offline start can still name it. Plain TypeScript; never throws when storage is blocked.

export const CONTACT_KEY = 'feeder.contact'

type Listener = (at: Date) => void

let loaded = false
let last: Date | null = null
const listeners = new Set<Listener>()

function readStored(): Date | null {
  try {
    const raw = localStorage.getItem(CONTACT_KEY)
    if (!raw) return null
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

function ensureLoaded(): void {
  if (loaded) return
  loaded = true
  last = readStored()
}

/** The newest recorded answer, or null when none was ever seen on this device. */
export function lastServerContact(): Date | null {
  ensureLoaded()
  return last
}

/** Records an OK answer at `at` (default now). An older moment never moves it back. */
export function recordServerContact(at: Date = new Date()): void {
  ensureLoaded()
  if (last && at.getTime() <= last.getTime()) return
  last = at
  try {
    localStorage.setItem(CONTACT_KEY, at.toISOString())
  } catch {
    // Storage blocked: still known for this session.
  }
  for (const fn of listeners) fn(at)
}

export function subscribeServerContact(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Forgets the moment (sign-out clears it with the signed-in cache). `keepStored` only drops the in-memory copy (tests: a fresh start). */
export function resetServerContact(opts: { keepStored?: boolean } = {}): void {
  loaded = false
  last = null
  if (opts.keepStored) return
  try {
    localStorage.removeItem(CONTACT_KEY)
  } catch {
    // ignore
  }
}
