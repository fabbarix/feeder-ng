// B9-40 stub (SHORT-01): is Cook Mode in a phone held sideways? The developer implements it.
/**
 * The CSS query of short landscape (the cook.css blocks use the same text): under 500 px tall and at least 37.5 em (600 px) wide.
 * The chapter says 560 px; the breakpoint table (DS-09, check-ui media-width, which fails features/cook) has no 560, and amendment A1 makes
 * 667x375 the smallest landscape, so the table's 37.5 em is the nearest. Two whole pills fit from 48 em (768 px), one below.
 */
export const SHORT_LANDSCAPE_QUERY = '(max-height: 499px) and (min-width: 37.5em)'

export interface ShortLandscape {
  short: boolean
  /** How many whole timer pills fit (lib/timers visiblePillCount: two from 48 em, else one); undefined outside short landscape. */
  maxPills: number | undefined
}

export function useShortLandscape(): ShortLandscape {
  return { short: false, maxPills: undefined }
}
