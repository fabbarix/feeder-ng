// The Tag colour palette: ten ids, each with OKLCH triples for the pill fill (bg), text (fg) and dot, in both schemes (tg-ui.md 2).
// The numbers are tg-plan 3.3 (the same as palette.fixture.ts); styles.css holds the same values as oklch() tokens.
import type { Oklch } from '../../theme/color'
import type { TagColourId } from './types'

export interface TagColourScheme {
  bg: Oklch
  fg: Oklch
  dot: Oklch
}

export interface TagColour {
  id: TagColourId
  /** Display name for people: "Sage". */
  name: string
  light: TagColourScheme
  dark: TagColourScheme
}

type Lc = readonly [l: number, c: number]
interface Row {
  id: TagColourId
  name: string
  hue: number
  light: readonly [bg: Lc, fg: Lc, dot: Lc]
  dark: readonly [bg: Lc, fg: Lc, dot: Lc]
}

const ROWS: readonly Row[] = [
  { id: 'tomato', name: 'Tomato', hue: 29, light: [[0.94, 0.03], [0.4, 0.1], [0.58, 0.15]], dark: [[0.33, 0.06], [0.9, 0.052], [0.78, 0.128]] },
  { id: 'apricot', name: 'Apricot', hue: 60, light: [[0.94, 0.036], [0.4, 0.094], [0.58, 0.136]], dark: [[0.33, 0.06], [0.9, 0.06], [0.78, 0.13]] },
  { id: 'mustard', name: 'Mustard', hue: 90, light: [[0.94, 0.05], [0.4, 0.08], [0.58, 0.118]], dark: [[0.33, 0.06], [0.9, 0.06], [0.78, 0.13]] },
  { id: 'olive', name: 'Olive', hue: 120, light: [[0.94, 0.05], [0.4, 0.094], [0.58, 0.136]], dark: [[0.33, 0.06], [0.9, 0.06], [0.78, 0.13]] },
  { id: 'sage', name: 'Sage', hue: 150, light: [[0.94, 0.05], [0.4, 0.098], [0.58, 0.15]], dark: [[0.33, 0.06], [0.9, 0.06], [0.78, 0.13]] },
  { id: 'teal', name: 'Teal', hue: 190, light: [[0.94, 0.05], [0.4, 0.068], [0.58, 0.1]], dark: [[0.33, 0.056], [0.9, 0.06], [0.78, 0.13]] },
  { id: 'sky', name: 'Sky', hue: 230, light: [[0.94, 0.034], [0.4, 0.078], [0.58, 0.114]], dark: [[0.33, 0.06], [0.9, 0.06], [0.78, 0.13]] },
  { id: 'blue', name: 'Blue', hue: 265, light: [[0.94, 0.028], [0.4, 0.1], [0.58, 0.15]], dark: [[0.33, 0.06], [0.9, 0.048], [0.78, 0.11]] },
  { id: 'plum', name: 'Plum', hue: 310, light: [[0.94, 0.038], [0.4, 0.1], [0.58, 0.15]], dark: [[0.33, 0.06], [0.9, 0.06], [0.78, 0.13]] },
  { id: 'rose', name: 'Rose', hue: 350, light: [[0.94, 0.034], [0.4, 0.1], [0.58, 0.15]], dark: [[0.33, 0.06], [0.9, 0.06], [0.78, 0.13]] },
]

const triple = ([l, c]: Lc, h: number): Oklch => ({ l, c, h })
const scheme = (cells: readonly [bg: Lc, fg: Lc, dot: Lc], h: number): TagColourScheme => ({
  bg: triple(cells[0], h),
  fg: triple(cells[1], h),
  dot: triple(cells[2], h),
})

/** The ids in palette order. */
export const TAG_COLOURS: readonly TagColourId[] = ROWS.map((r) => r.id)
/** The full palette, in palette order. */
export const TAG_PALETTE: readonly TagColour[] = ROWS.map((r) => ({
  id: r.id,
  name: r.name,
  light: scheme(r.light, r.hue),
  dark: scheme(r.dark, r.hue),
}))

export function isTagColour(id: unknown): id is TagColourId {
  return typeof id === 'string' && (TAG_COLOURS as readonly string[]).includes(id)
}

/** "Sage" for 'sage'; undefined for an unknown id. */
export function tagColourName(id: string): string | undefined {
  return TAG_PALETTE.find((c) => c.id === id)?.name
}

/** CSS custom property for a token: `--tag-sage-dot`. */
export function tagToken(id: TagColourId, part: 'bg' | 'fg' | 'dot'): string {
  return `--tag-${id}-${part}`
}
