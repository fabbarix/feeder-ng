import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { TileErrorBoundary } from '../../../app/TileErrorBoundary'
import { usePlan } from '../../plan'
import { useHouseholdSettings } from '../../settings/hooks/useHouseholdSettings'
import { EmptyState, ErrorState, useBreakpoint } from '../../../ui'
import { useDocumentTitle } from '../../../ui/lib/useDocumentTitle'
import { BoardHeroTile, BoardLeftoversTile, BoardTimersTile, ClockTile, NextAdvanceTile, StreakTile, TomorrowTile, UseSoonTile } from '../components/BoardTiles'
import { CloseBoard } from '../components/CloseBoard'
import { useAdvanceDone, useBoard, useBoardScheme, useNow } from '../hooks/useBoard'
import { useBoardLayout } from '../hooks/useBoardLayout'
import { useBoardPalette } from '../hooks/useBoardPalette'
import { BOARD_TILE_KEYS, useBoardHero, useBoardLeftovers, useBoardTimers, useBoardTomorrow, useBoardUseSoon } from '../hooks/useBoardTiles'
import { useIdle } from '../hooks/useIdle'
import { useLeaveOnEscape } from '../hooks/useLeaveBoard'
import { boardLayout, type BoardCell } from '../lib/layout'
import { boardSlots } from '../lib/tiles'
import { boardStrings } from '../strings'
import type { SlotLike } from '../types'
import '../board.css'

interface CellProps {
  id: BoardCell['id']
  layout: BoardCell[]
  /** The tile's name in its crashed notice ("Leftovers couldn’t be shown."). */
  title: string
  queryKeys?: ReadonlyArray<readonly unknown[]>
  /** A new board payload gives a crashed tile that reads it another go by itself. */
  resetKeys?: ReadonlyArray<unknown>
  children: ReactNode
}

/** Places one tile on its cell of the layout in use, inside its own TileErrorBoundary (RES-09). */
function Cell({ id, layout, title, queryKeys, resetKeys, children }: CellProps): ReactNode {
  const cell = layout.find((c) => c.id === id)
  const style = cell ? { gridColumn: `${cell.col} / span ${cell.colSpan}`, gridRow: `${cell.row} / span ${cell.rowSpan}` } : undefined
  return (
    <div className="board-cell" data-cell={id} style={style}>
      <TileErrorBoundary title={title} scope={boardStrings.boundaryScope} queryKeys={queryKeys} resetKeys={resetKeys}>
        {children}
      </TileErrorBoundary>
    </div>
  )
}

// Each tile below reads or derives its data in its own component, so it does so inside its cell's boundary (RES-09).

function HeroCell({ slots, now, today }: { slots: SlotLike[]; now: Date; today: string }): ReactNode {
  const navigate = useNavigate()
  const { hero, notServed } = useBoardHero(slots, now, today)
  return <BoardHeroTile hero={hero} notServed={notServed} onCook={hero ? () => navigate(hero.cookPath) : undefined} />
}

function TomorrowCell({ slots, today }: { slots: SlotLike[]; today: string }): ReactNode {
  return <TomorrowTile slots={useBoardTomorrow(slots, today)} />
}

function LeftoversCell({ today }: { today: string }): ReactNode {
  return <BoardLeftoversTile rows={useBoardLeftovers()} today={today} />
}

function UseSoonCell({ today }: { today: string }): ReactNode {
  return <UseSoonTile rows={useBoardUseSoon()} today={today} />
}

function TimersCell(): ReactNode {
  return <BoardTimersTile items={useBoardTimers()} />
}

/** The hidden page heading (A11Y-12, TB-15d), in every state of the board. */
function BoardFrame({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="board-screen" data-board="true">
      <h1 id="page-title" className="visually-hidden" tabIndex={-1}>
        {boardStrings.documentTitle}
      </h1>
      {children}
    </div>
  )
}

/**
 * The kitchen board (`/board`, a wall display; chromeless, see app/chromeless.ts). Its own grid of 8 tiles placed by lib/layout in one
 * of four layouts (useBoardLayout: wall 4 x 3, portrait 2 x 5, scroll for a phone held sideways, phone 2 columns). The hero is Today's
 * selection under Today's eyebrow (TB 7); the clock tile carries the round Close kitchen board, which dims after 10 s idle (TB-04), and
 * Esc leaves the same way. Each tile sits in its own TileErrorBoundary (RES-09). A load error is an ErrorState with Try again (TB-15c),
 * with the heading and Close still there. The board's light/dark scheme comes from the server's theme (useBoardScheme), overriding the
 * User's preference on this route only.
 */
export function BoardScreen(): ReactNode {
  useDocumentTitle([boardStrings.documentTitle])
  useLeaveOnEscape()
  const idle = useIdle()
  const board = useBoard()
  const scheme = useBoardScheme(board.data, board.refetch)
  useBoardPalette(scheme.dark)
  const plan = usePlan()
  const settings = useHouseholdSettings()
  const markDone = useAdvanceDone()
  const clock = useNow(10_000)
  // L-10: from 600 px the wall, portrait or scroll grid; below, 2 columns.
  const kind = useBoardLayout(useBreakpoint('tablet'))

  if (board.error || !board.data) {
    return (
      <BoardFrame>
        <div className="board-status">
          <div className="board-status__top">
            <CloseBoard idle={idle} />
          </div>
          {board.error ? <ErrorState message={boardStrings.loadError} onRetry={board.refetch} /> : <EmptyState title={boardStrings.loading} />}
        </div>
      </BoardFrame>
    )
  }

  const data = board.data
  const zone = settings.settings?.timeZone ?? 'UTC'
  // CRS F: the board's own slots (with their Courses) when the payload has them; the plan's for an older payload.
  const slots = boardSlots(data.slots, plan.slots)
  const layout = boardLayout(kind)

  return (
    <BoardFrame>
      {/* The wall grid is the board's own layout (ADR 0016), not a BentoGrid: a fixed display at a known size. */}
      <div className="board-grid" data-layout={kind}>
        {/* The clock comes first in the DOM: its Close is the board's first focusable element (TB-04). The grid places it. */}
        <Cell id="clock" layout={layout} title={boardStrings.clockTile}>
          <ClockTile now={clock} timeZone={zone} close={<CloseBoard idle={idle} />} />
        </Cell>
        <Cell id="tonight" layout={layout} title={boardStrings.heroTile} resetKeys={[data, plan.slots]}>
          <HeroCell slots={slots} now={clock} today={data.today} />
        </Cell>
        <Cell id="nextAdvance" layout={layout} title={boardStrings.nextAdvance} resetKeys={[data]}>
          <NextAdvanceTile next={data.nextAdvance} nowMs={clock.getTime()} timeZone={zone} onDone={markDone} />
        </Cell>
        <Cell id="leftovers" layout={layout} title={boardStrings.leftovers} queryKeys={BOARD_TILE_KEYS.leftovers}>
          <LeftoversCell today={data.today} />
        </Cell>
        <Cell id="timers" layout={layout} title={boardStrings.timers} queryKeys={BOARD_TILE_KEYS.timers}>
          <TimersCell />
        </Cell>
        <Cell id="tomorrow" layout={layout} title={boardStrings.tomorrow} resetKeys={[data, plan.slots]}>
          <TomorrowCell slots={slots} today={data.today} />
        </Cell>
        <Cell id="useSoon" layout={layout} title={boardStrings.useSoon} queryKeys={BOARD_TILE_KEYS.useSoon}>
          <UseSoonCell today={data.today} />
        </Cell>
        <Cell id="streak" layout={layout} title={boardStrings.streak} resetKeys={[data]}>
          <StreakTile days={data.streak.days} />
        </Cell>
      </div>
    </BoardFrame>
  )
}
