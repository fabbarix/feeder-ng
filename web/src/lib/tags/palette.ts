// The Tag colour palette: ten ids, each with OKLCH triples for the pill fill (bg), text (fg) and dot, in both schemes (tg-ui.md 2).
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

// TG-UI stub: the Developer fills these from palette.fixture.ts (the numbers in docs/dev/design/tg-plan.md 3.3).
/** The ids in palette order. */
export const TAG_COLOURS: readonly TagColourId[] = []
/** The full palette, in palette order. */
export const TAG_PALETTE: readonly TagColour[] = []

export function isTagColour(id: unknown): id is TagColourId {
  void id
  return false
}

/** "Sage" for 'sage'; undefined for an unknown id. */
export function tagColourName(id: string): string | undefined {
  void id
  return undefined
}

/** CSS custom property for a token: `--tag-sage-dot`. */
export function tagToken(id: TagColourId, part: 'bg' | 'fg' | 'dot'): string {
  void id
  void part
  throw new Error('TG-UI: not implemented')
}
