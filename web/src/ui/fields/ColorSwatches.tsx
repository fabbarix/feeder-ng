import type { ReactNode } from 'react'

export interface Swatch {
  /** "#rrggbb". */
  value: string
  /** Accessible name, e.g. "Basil". */
  name: string
}

export interface ColorSwatchesProps {
  label: string
  swatches: Swatch[]
  /** Current colour; if it is not one of the swatches the Custom swatch shows as selected. */
  value: string
  onChange: (value: string) => void
  /** Shows the "Custom" swatch that opens the crafted picker. */
  allowCustom?: boolean
}

/** STUB (WP4 designer). Radiogroup of 40 px circles; Custom opens a Dialog with a hue Slider and a hex TextField. */
export function ColorSwatches(_props: ColorSwatchesProps): ReactNode {
  throw new Error('not implemented')
}
