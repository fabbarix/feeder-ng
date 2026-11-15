import { useCallback, useState } from 'react'

export type ShareOutcome = 'shared' | 'cancelled' | 'failed'

function deviceCanShare(probe: ShareData): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
  try {
    return navigator.canShare?.(probe) !== false
  } catch {
    return false
  }
}

/** The device's share sheet, only through the Share control that asks for it. `canShare` is decided once, at the first render
 *  ("once per page load"). `share` resolves 'shared', 'cancelled' (AbortError: the person closed the sheet) or 'failed' (any
 *  other error, or no share sheet); it never rejects. */
export function useShareText(probe: ShareData): { canShare: boolean; share: (data: ShareData) => Promise<ShareOutcome> } {
  const [canShare] = useState(() => deviceCanShare(probe))
  const share = useCallback(async (data: ShareData): Promise<ShareOutcome> => {
    try {
      if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return 'failed'
      await navigator.share(data)
      return 'shared'
    } catch (err) {
      return err instanceof Error && err.name === 'AbortError' ? 'cancelled' : 'failed'
    }
  }, [])
  return { canShare, share }
}
