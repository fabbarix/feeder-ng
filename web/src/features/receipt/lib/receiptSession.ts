// The Scanned list the Scan screen publishes for the receipt routes, read again at apply time. A small store, no React.
import type { ReceiptSession } from '../types'

let current: ReceiptSession | undefined
const listeners = new Set<() => void>()

/** Holds a copy of the session and tells every subscriber. `undefined` ends it. */
export function publishReceiptSession(session: ReceiptSession | undefined): void {
  current = session ? { shopId: session.shopId, clientUuids: [...session.clientUuids] } : undefined
  for (const listener of [...listeners]) listener()
}

export function getReceiptSession(): ReceiptSession | undefined {
  return current
}

export function subscribeReceiptSession(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
