// STUB for the B9-01 tests to compile; the Developer replaces it (DS-12 R-B).
import type { ButtonHTMLAttributes } from 'react'

export interface CloseButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  /** Accessible name; default `uiStrings.close`. */
  label?: string
}

export function CloseButton(_props: CloseButtonProps) {
  return null
}
