import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTimers } from '../../cook/hooks/useTimers'
import { useLeftovers, usePlan } from '../../plan'
import { useStockTotals } from '../../stock/hooks/useStock'
import { useHouseholdSettings } from '../../settings/hooks/useHouseholdSettings'
import { BentoGrid, EmptyState } from '../../../ui'
import { StartCookTile, TonightTile, ClockTile, NextAdvanceTile, BoardLeftoversTile, UseSoonTile, BoardTimersTile, TomorrowTile, StreakTile } from '../components/BoardTiles'
import { useAdvanceDone, useBoard, useBoardScheme, useNow } from '../hooks/useBoard'
import { useBoardPalette } from '../hooks/useBoardPalette'
import { leftoverRows, startCookPath, tomorrowMeals, tonightMeal, useSoonRows } from '../lib/tiles'
import { boardStrings } from '../strings'
import '../board.css'

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
  const board = useBoard()
  const scheme = useBoardScheme(board.data, board.refetch)
  useBoardPalette(scheme.dark)
  const plan = usePlan()
  const { leftovers } = useLeftovers()
  const totals = useStockTotals()
  const timers = useTimers()
  const settings = useHouseholdSettings()
  const markDone = useAdvanceDone()
  const navigate = useNavigate()
  const clock = useNow(10_000)

  if (board.error) return <EmptyState title={boardStrings.loadError} />
  const data = board.data
  if (!data) return <EmptyState title={boardStrings.loading} />

  const zone = settings.settings?.timeZone ?? 'UTC'
  const nowIso = clock.toISOString()
  const tonight = tonightMeal(plan.slots, data.today, nowIso)
  const startPath = startCookPath(plan.slots, data.today, nowIso)

  return (
    <div className="board-screen" data-board="true">
      <BentoGrid columns={4}>
        <ClockTile now={clock} timeZone={zone} showFallbackHint={data.theme.source === 'fallback'} />
        <TonightTile slot={tonight} />
        <NextAdvanceTile next={data.nextAdvance} nowMs={clock.getTime()} onDone={markDone} />
        <BoardLeftoversTile rows={leftoverRows(leftovers, 5)} />
        <UseSoonTile rows={useSoonRows(totals.data ?? [], 5)} />
        <BoardTimersTile items={timers.items} />
        <TomorrowTile slots={tomorrowMeals(plan.slots, data.today)} />
        <StreakTile days={data.streak.days} />
        <StartCookTile onStart={startPath ? () => navigate(startPath) : undefined} />
      </BentoGrid>
    </div>
  )
}
