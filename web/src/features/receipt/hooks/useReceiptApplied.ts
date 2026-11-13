// The Scan screen's side of the hand-over: delivers a pending apply result on mount, then every new one.
import { useEffect, useRef } from 'react'
import { subscribeReceiptApplied, takePendingReceiptApplied } from '../lib/appliedEvents'
import type { ReceiptAppliedEvent } from '../types'

export function useReceiptApplied(handler: (e: ReceiptAppliedEvent) => void): void {
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  })
  useEffect(() => {
    const off = subscribeReceiptApplied((e) => latest.current(e))
    const pending = takePendingReceiptApplied()
    if (pending) latest.current(pending)
    return off
  }, [])
}
