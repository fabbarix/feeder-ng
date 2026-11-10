import { useSyncExternalStore } from 'react'

/** True while `query` matches. Without `matchMedia` (jsdom, old browsers) it is true: the desktop presentation. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(query) : null
      if (!mql) return () => {}
      mql.addEventListener?.('change', onChange)
      return () => mql.removeEventListener?.('change', onChange)
    },
    () => (typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(query).matches : true),
    () => true,
  )
}
