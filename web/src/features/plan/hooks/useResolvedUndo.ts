// B9-26 (SAFE-03): the Undo actions of the Planned Meal sheet of a Cooked or Not cooked meal (Plan and Today).
import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { reopenedText } from '../lib/resolved'
import type { SlotKey } from '../types'
import { cachedSlots } from './replanState'
import { useReopen } from './useReopen'

export interface ResolvedUndo {
  onUndoCooked: (key: SlotKey) => void
  onUndoNotCooked: (key: SlotKey) => void
  /** Reopens the Not cooked meal, then opens its Mark as Cooked sheet. */
  onCookedAfterAll: (key: SlotKey) => void
}

/** `closeSheet` closes the Planned Meal sheet first (one sheet at a time); `openMarkCooked` is the cook flow's open. */
export function useResolvedUndo(closeSheet: () => void, openMarkCooked: (key: SlotKey) => void): ResolvedUndo {
  const client = useQueryClient()
  const reopen = useReopen()
  return useMemo(() => {
    const undo = (key: SlotKey) => {
      closeSheet()
      return reopen.undoNow(key, reopenedText(cachedSlots(client), key))
    }
    return {
      onUndoCooked: (key) => void undo(key),
      onUndoNotCooked: (key) => void undo(key),
      onCookedAfterAll: (key) => {
        void undo(key).then((ok) => {
          if (ok) openMarkCooked(key)
        })
      },
    }
  }, [client, reopen, closeSheet, openMarkCooked])
}
