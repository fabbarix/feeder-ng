// The reference numbers of the Tag palette (docs/dev/design/tg-plan.md 3.3): [L, C, hex] for bg / fg / dot, light then dark.
// Tests compare palette.ts and styles.css with this table. Hue per colour in the second field.
import type { TagColourId } from './types'

type Cell = readonly [l: number, c: number, hex: string]
export interface ReferenceColour {
  id: TagColourId
  name: string
  hue: number
  light: { bg: Cell; fg: Cell; dot: Cell }
  dark: { bg: Cell; fg: Cell; dot: Cell }
}

const row = (
  id: TagColourId, name: string, hue: number,
  lbg: Cell, lfg: Cell, ldot: Cell, dbg: Cell, dfg: Cell, ddot: Cell,
): ReferenceColour => ({ id, name, hue, light: { bg: lbg, fg: lfg, dot: ldot }, dark: { bg: dbg, fg: dfg, dot: ddot } })

export const REFERENCE_PALETTE: readonly ReferenceColour[] = [
  row('tomato', 'Tomato', 29, [0.94, 0.03, '#ffe4e0'], [0.4, 0.1, '#742f26'], [0.58, 0.15, '#c35043'], [0.33, 0.06, '#502923'], [0.9, 0.052, '#ffd2ca'], [0.78, 0.128, '#ff9687']),
  row('apricot', 'Apricot', 60, [0.94, 0.036, '#fee6d4'], [0.4, 0.094, '#6b3900'], [0.58, 0.136, '#b36300'], [0.33, 0.06, '#4c2d12'], [0.9, 0.06, '#fdd5b7'], [0.78, 0.13, '#f4a25c']),
  row('mustard', 'Mustard', 90, [0.94, 0.05, '#f8eac6'], [0.4, 0.08, '#584503'], [0.58, 0.118, '#957602'], [0.33, 0.06, '#41340a'], [0.9, 0.06, '#edddb1'], [0.78, 0.13, '#d8b349']),
  row('olive', 'Olive', 120, [0.94, 0.05, '#e6f1cc'], [0.4, 0.094, '#424e02'], [0.58, 0.136, '#718506'], [0.33, 0.06, '#313a13'], [0.9, 0.06, '#d8e5b8'], [0.78, 0.13, '#adc35e']),
  row('sage', 'Sage', 150, [0.94, 0.05, '#d5f5da'], [0.4, 0.1, '#115629'], [0.58, 0.15, '#1b9247'], [0.33, 0.06, '#1c3e24'], [0.9, 0.06, '#c3eac9'], [0.78, 0.13, '#76cf8a']),
  row('teal', 'Teal', 190, [0.94, 0.05, '#c6f7f2'], [0.4, 0.068, '#035350'], [0.58, 0.1, '#018d87'], [0.33, 0.056, '#023e3c'], [0.9, 0.06, '#b0ebe7'], [0.78, 0.13, '#21d1ca']),
  row('sky', 'Sky', 230, [0.94, 0.034, '#d5f0fe'], [0.4, 0.078, '#044f69'], [0.58, 0.114, '#0886b0'], [0.33, 0.06, '#093b4e'], [0.9, 0.06, '#b6e6ff'], [0.78, 0.13, '#4bc6fa']),
  row('blue', 'Blue', 265, [0.94, 0.028, '#e2ebff'], [0.4, 0.1, '#2d457d'], [0.58, 0.15, '#4e75d2'], [0.33, 0.06, '#263454'], [0.9, 0.048, '#cfdeff'], [0.78, 0.11, '#95b6fe']),
  row('plum', 'Plum', 310, [0.94, 0.038, '#f3e5ff'], [0.4, 0.1, '#58366f'], [0.58, 0.15, '#955dbc'], [0.33, 0.06, '#3f2c4c'], [0.9, 0.06, '#ead4fc'], [0.78, 0.13, '#d19ff5']),
  row('rose', 'Rose', 350, [0.94, 0.034, '#fee2ee'], [0.4, 0.1, '#6e2e4f'], [0.58, 0.15, '#b94f87'], [0.33, 0.06, '#4c283a'], [0.9, 0.06, '#fecee4'], [0.78, 0.13, '#f594c3']),
]
