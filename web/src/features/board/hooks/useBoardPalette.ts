import { useEffect, useRef } from 'react'
import { applyTheme } from '../../../theme/apply'
import type { Scheme as PaletteScheme } from '../../../theme/palette'
import { usePreferenceTheme } from '../../settings/hooks/usePreferenceTheme'

/**
 * Paints the accent palette in the board's scheme (dark or light by the
 * server's theme), overriding the User's preference on /board only. On unmount
 * the User's own scheme is restored.
 */
export function useBoardPalette(dark: boolean): void {
  const pref = usePreferenceTheme()
  const restore = useRef<() => void>(() => {})
  restore.current = () => {
    const userScheme: PaletteScheme = pref.scheme === 'system' ? systemScheme() : pref.scheme
    applyTheme(document.documentElement, { accent: pref.accent, secondary: pref.secondary }, userScheme)
  }

  useEffect(() => {
    applyTheme(document.documentElement, { accent: pref.accent, secondary: pref.secondary }, dark ? 'dark' : 'light')
  }, [dark, pref.accent, pref.secondary])

  useEffect(() => () => restore.current(), [])
}

function systemScheme(): PaletteScheme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
