import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { slotAnchorId, slotIdFromHash } from '../lib/slotAnchor'
import type { MealSlot } from '../types'

/** R15: when the URL hash names a Meal Slot that exists (`#meal-slot-12`), scroll to it and focus it, once per hash. */
export function useSlotAnchor(slots: MealSlot[]) {
  const routerHash = useLocation().hash
  const done = useRef<string | null>(null)
  useEffect(() => {
    const hash = routerHash || window.location.hash
    const id = slotIdFromHash(hash)
    if (id === null || done.current === hash || !slots.some((s) => s.id === id)) return
    const el = document.getElementById(slotAnchorId(id))
    if (!el) return
    done.current = hash
    el.scrollIntoView({ block: 'center' })
    el.focus()
  }, [routerHash, slots])
}
