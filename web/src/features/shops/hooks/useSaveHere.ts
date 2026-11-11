// "Save my current location" for an existing Shop: a tap asks for the position, and a fix good enough to save is saved
// as its Shop Location at once. React hook over usePosition.
import { useEffect, useRef, useState } from 'react'
import { locationToSave } from '../lib/nearest'
import type { ShopLocation } from '../types'
import { usePosition, type UsePosition, type UsePositionOptions } from './usePosition'

export interface UseSaveHere extends UsePosition {
  saving: boolean
  /** the save's error, if it failed */
  error: unknown
  /** the tap */
  saveHere: () => void
}

export function useSaveHere(onSave: (location: ShopLocation) => Promise<void>, options?: UsePositionOptions): UseSaveHere {
  const position = usePosition(options)
  const pending = useRef(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!pending.current || position.status === 'locating' || position.status === 'idle') return
    pending.current = false
    const location = locationToSave(true, position.position)
    if (!location) return
    setSaving(true)
    onSave(location)
      .catch(setError)
      .finally(() => setSaving(false))
    // only a finished fix after a tap saves
  }, [position.status, position.position])

  return {
    ...position,
    saving,
    error,
    saveHere: () => {
      pending.current = true
      setError(null)
      position.locate()
    },
  }
}
