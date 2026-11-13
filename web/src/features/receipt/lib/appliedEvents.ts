// The hand-over of an apply's results to the Scanned session. An event with nobody listening waits as pending, taken once.
import type { ReceiptAppliedEvent } from '../types'

const listeners = new Set<(e: ReceiptAppliedEvent) => void>()
let pending: ReceiptAppliedEvent | undefined

export function emitReceiptApplied(event: ReceiptAppliedEvent): void {
  if (listeners.size === 0) {
    pending = event
    return
  }
  for (const listener of [...listeners]) listener(event)
}

export function takePendingReceiptApplied(): ReceiptAppliedEvent | undefined {
  const event = pending
  pending = undefined
  return event
}

export function subscribeReceiptApplied(listener: (e: ReceiptAppliedEvent) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
