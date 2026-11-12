import type { ExplanationGroup } from '../lib/couldntExclusions'

export interface ExplanationExpansion {
  isOpen: (key: string) => boolean
  toggle: (key: string) => void
  /** The id of the cell the URL hash names ("cell-2026-11-13-4-2") when a group has it; else null. The screen focuses it. */
  targetId: string | null
}

/** Which explanation Tiles show their full list of cells. The one holding the cell named by `hash` ("#cell-...") starts open. */
export function useExplanationExpansion(_groups: ExplanationGroup[], _hash: string): ExplanationExpansion {
  throw new Error('CRS G2: not implemented')
}
