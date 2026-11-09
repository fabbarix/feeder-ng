import type { Leftover } from '../types'

export interface LeftoverRow {
  id: number
  recipeName: string
  portions: string
  /** "Use by Thu", "Use by today". */
  useBy: string
  /** 'spoil' when the Use-by is today or tomorrow, otherwise 'leftover'. */
  tone: 'spoil' | 'leftover'
}

/** The rows of the "Leftovers to use" tile, soonest Use-by first. */
export function leftoverRows(leftovers: Leftover[], today: string): LeftoverRow[] {
  void [leftovers, today]
  throw new Error('TODO: developer')
}
