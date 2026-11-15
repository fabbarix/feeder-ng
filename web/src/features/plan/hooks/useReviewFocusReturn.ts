// B9-32 (B9-26 hand-back, PC-01, A11Y-07): when "What changed" closes (Keep the changes, Escape, Close or Undo all), focus goes
// back to the row the edit was made on, never to the page.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { focusPlanRow } from '../lib/rowFocus'
import type { SlotKey } from '../types'
import { readReplan } from './replanState'

export function useReviewFocusReturn(open: boolean): void {
  const client = useQueryClient()
  const target = useRef<SlotKey | null>(null)
  const wasOpen = useRef(open)
  useEffect(() => {
    if (open) {
      target.current = readReplan(client)?.target ?? null
    } else if (wasOpen.current && target.current) {
      const key = target.current
      target.current = null
      // After the sheet's own focus restore, and after an Undo all's refetch has drawn the row again.
      setTimeout(() => focusPlanRow(key), 0)
    }
    wasOpen.current = open
  }, [open, client])
}
