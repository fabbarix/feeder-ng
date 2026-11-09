import { useEffect, type ReactNode } from 'react'
import { applyTheme } from './apply'
import type { Hex, Scheme } from './palette'

export interface ThemeProviderProps {
  accent: Hex
  secondary?: Hex
  /** 'system' follows prefers-color-scheme. */
  scheme: Scheme | 'system'
  children: ReactNode
}

function resolveScheme(scheme: Scheme | 'system'): Scheme {
  if (scheme !== 'system') return scheme
  const dark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return dark ? 'dark' : 'light'
}

/** Applies the accent palette to the document element whenever its inputs change. */
export function ThemeProvider({ accent, secondary, scheme, children }: ThemeProviderProps) {
  const resolved = resolveScheme(scheme)
  useEffect(() => {
    applyTheme(document.documentElement, { accent, secondary }, resolved)
  }, [accent, secondary, resolved])
  return <>{children}</>
}
