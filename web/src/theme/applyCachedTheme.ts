// B9-49 (RES-08): main.tsx calls this before createRoot, so React's first frame already has the User's whole token set.
import { applyTheme } from './apply'
import { readThemeCache, resolveCachedScheme } from './themeCache'

/** Applies the cached theme to `root`; false (and nothing touched) when none is cached. */
export function applyCachedTheme(root: HTMLElement, prefersDark: boolean): boolean {
  const cache = readThemeCache()
  if (!cache) return false
  applyTheme(root, { accent: cache.accent }, resolveCachedScheme(cache, prefersDark))
  return true
}
