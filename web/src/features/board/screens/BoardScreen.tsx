import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTimers } from '../../cook/hooks/useTimers'
import { useLeftovers, usePlan } from '../../plan'
import { useStockTotals } from '../../stock/hooks/useStock'
import { useHouseholdSettings } from '../../settings/hooks/useHouseholdSettings'
import { BentoGrid, EmptyState, useMediaQuery } from '../../../ui'
import { ClockTile, NextAdvanceTile, BoardLeftoversTile, UseSoonTile, BoardTimersTile, TomorrowTile, StreakTile, TonightTile } from '../components/BoardTiles'
import { useAdvanceDone, useBoard, useBoardScheme, useNow } from '../hooks/useBoard'
import { useBoardPalette } from '../hooks/useBoardPalette'
import { boardLayout, type BoardCell } from '../lib/layout'
import { boardSlots, leftoverRows, startCookPath, tomorrowSlots, tonightMeal, useSoonRows } from '../lib/tiles'
import { boardStrings } from '../strings'
import '../board.css'

/** Places one tile on its cell of the layout in use. */
function Cell({ id, layout, children }: { id: BoardCell['id']; layout: BoardCell[]; children: ReactNode }): ReactNode {
  const cell = layout.find((c) => c.id === id)
  const style = cell ? { gridColumn: `${cell.col} / span ${cell.colSpan}`, gridRow: `${cell.row} / span ${cell.rowSpan}` } : undefined
  return (
    <div className="board-cell" style={style}>
      {children}
    </div>
  )
}

/**
 * The kitchen board (`/board`, wall display). A `BentoGrid columns={4}` of 12 cells placed by lib/layout
 * BOARD_LAYOUT (4 x 3 at 1280 x 800, no overlap): Tonight is the 2 x 2 hero with the big "Cook" button (starts Cook
 * Mode); the clock, Next Advance Step, Leftovers, Timers, Use soon (2 x 1), Tomorrow and the streak fill the rest.
 * Data: useBoard (theme, streak, nextAdvance), usePlan (slots, today) and
 * useLeftovers from features/plan (import after the branch is synced with
 * main), Stock totals via features/stock's api (useSoonRows), useTimers() for
 * the running timers, useNow(10_000) for the clock. The household time zone
 * comes from the settings query. The page wraps itself in a ThemeProvider whose
 * scheme comes from useBoardScheme (overriding the User's preference on this
 * route only) and sets `data-board` for board.css (>= 3rem clock and meal names,
 * >= 1.5rem body text, readable from 2 m). Loading and error states use
 * EmptyState. NextAdvanceTile's Done calls cookApi.setMark and refetches.
 * The Cook button navigates to lib/tiles.startCookPath.
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
  // L-10: the 4 x 3 wall grid from 600 px, 2 columns below.
  const wall = useMediaQuery('(min-width: 600px)')

  if (board.error) return <EmptyState title={boardStrings.loadError} />
  const data = board.data
  if (!data) return <EmptyState title={boardStrings.loading} />

  const zone = settings.settings?.timeZone ?? 'UTC'
  const nowIso = clock.toISOString()
  // CRS F: the board's own slots (with their Courses) when the payload has them; the plan's for an older payload.
  const slots = boardSlots(data.slots, plan.slots)
  const tonight = tonightMeal(slots, data.today, nowIso)
  const startPath = startCookPath(slots, data.today, nowIso)

  const layout = boardLayout(wall ? 4 : 2)

  return (
    <div className="board-screen" data-board="true">
      <BentoGrid columns={wall ? 4 : 2}>
        <Cell id="tonight" layout={layout}>
          <TonightTile slot={tonight} onCook={startPath ? () => navigate(startPath) : undefined} />
        </Cell>
        <Cell id="clock" layout={layout}>
          <ClockTile now={clock} timeZone={zone} />
        </Cell>
        <Cell id="nextAdvance" layout={layout}>
          <NextAdvanceTile next={data.nextAdvance} nowMs={clock.getTime()} timeZone={zone} onDone={markDone} />
        </Cell>
        <Cell id="leftovers" layout={layout}>
          <BoardLeftoversTile rows={leftoverRows(leftovers, 5)} />
        </Cell>
        <Cell id="timers" layout={layout}>
          <BoardTimersTile items={timers.items} />
        </Cell>
        <Cell id="tomorrow" layout={layout}>
          <TomorrowTile slots={tomorrowSlots(slots, data.today)} />
        </Cell>
        <Cell id="useSoon" layout={layout}>
          <UseSoonTile rows={useSoonRows(totals.data ?? [], 5)} />
        </Cell>
        <Cell id="streak" layout={layout}>
          <StreakTile days={data.streak.days} />
        </Cell>
      </BentoGrid>
    </div>
  )
}
