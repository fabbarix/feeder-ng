import type { ReactNode } from 'react'

/**
 * The kitchen board (`/board`, tablet). A `BentoGrid columns={4}`, 4x3:
 * row 1: ClockTile (wide), TonightTile (wide, accent);
 * row 2: NextAdvanceTile, BoardLeftoversTile, UseSoonTile, BoardTimersTile;
 * row 3: TomorrowTile (wide), StreakTile, StartCookTile.
 * Data: useBoard (theme, streak, nextAdvance), usePlan (slots, today) and
 * useLeftovers from features/plan (import after the branch is synced with
 * main), Stock totals via features/stock's api (useSoonRows), useTimers() for
 * the running timers, useNow(10_000) for the clock. The household time zone
 * comes from the settings query. The page wraps itself in a ThemeProvider whose
 * scheme comes from useBoardScheme (overriding the User's preference on this
 * route only) and sets `data-board` for board.css (>= 3rem clock and meal names,
 * >= 1.5rem body text, readable from 2 m). Loading and error states use
 * EmptyState. NextAdvanceTile's Done calls cookApi.setMark and refetches.
 * StartCookTile navigates to lib/tiles.startCookPath.
 */
export function BoardScreen(): ReactNode {
  return null
}
