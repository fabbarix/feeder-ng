import type { ReactNode } from 'react'

export interface SliderStop {
  value: number
  label: string
}

export interface SliderProps {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  /** Default 1. */
  step?: number
  /** Labelled stops under the track; the active one is the aria-valuetext. */
  stops?: SliderStop[]
  disabled?: boolean
  helper?: string
}

/** STUB (WP4 designer). role=slider thumb on a custom track; no <input type=range>. */
export function Slider(_props: SliderProps): ReactNode {
  throw new Error('not implemented')
}
