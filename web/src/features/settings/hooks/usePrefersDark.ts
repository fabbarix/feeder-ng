import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-color-scheme: dark)'

const media = (): MediaQueryList | null => (typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(QUERY) : null)

/** True while the device prefers a dark scheme; follows a System scheme change. False without `matchMedia`. */
export function usePrefersDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = media()
      mql?.addEventListener?.('change', onChange)
      return () => mql?.removeEventListener?.('change', onChange)
    },
    () => media()?.matches === true,
    () => false,
  )
}
