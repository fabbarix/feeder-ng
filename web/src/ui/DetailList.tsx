// STUB for the B9-01 tests to compile; the Developer replaces it (DS-12 R-E).
import type { ReactNode } from 'react'

export type DetailTone = 'info' | 'warn' | 'spoil' | 'danger' | 'leftover' | 'success' | 'neutral'

export interface DetailListProps {
  tone?: DetailTone
  children?: ReactNode
}

export interface DetailRowProps {
  label: ReactNode
  state?: ReactNode
  detail?: ReactNode
}

export function DetailList(_props: DetailListProps) {
  return null
}

export function DetailRow(_props: DetailRowProps) {
  return null
}
