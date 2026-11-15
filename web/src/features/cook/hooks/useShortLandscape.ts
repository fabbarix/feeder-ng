// B9-40 stub (SHORT-01): is Cook Mode in a phone held sideways? The developer implements it.
/** The CSS query of short landscape (the cook.css blocks use the same text): under 500 px tall and at least 560 px wide. */
export const SHORT_LANDSCAPE_QUERY = '(max-height: 499px) and (min-width: 560px)'

export interface ShortLandscape {
  short: boolean
  /** How many whole timer pills fit (lib/timers visiblePillCount of the window width); undefined outside short landscape. */
  maxPills: number | undefined
}

export function useShortLandscape(): ShortLandscape {
  return { short: false, maxPills: undefined }
}
