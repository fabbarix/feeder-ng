import { useCallback, useState } from 'react'
import type { Cause } from '../lib/couldntGroups'

/** Which cause tiles show their full list of meals. */
export function useCauseExpansion(): { isOpen: (cause: Cause) => boolean; toggle: (cause: Cause) => void } {
  const [open, setOpen] = useState<ReadonlySet<Cause>>(new Set())
  const toggle = useCallback((cause: Cause) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(cause)) next.delete(cause)
      else next.add(cause)
      return next
    })
  }, [])
  return { isOpen: (cause) => open.has(cause), toggle }
}
