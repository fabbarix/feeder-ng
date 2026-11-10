import type { ReactNode } from 'react'
import type { TimerItem } from '../../cook/hooks/useTimers'
import { Button, Chip, Tile, TimerTile } from '../../../ui'
import { clockText, dateText, dueText, shortWeekday, type LeftoverRow } from '../lib/tiles'
import { boardStrings } from '../strings'
import type { NextAdvance, SlotLike, StockTotalLike } from '../types'

// The kitchen board's tiles, composed from the shared Bento primitives (Tile,
// Chip, TimerTile, Button). Each renders its data and wires events only; all
// choosing and formatting lives in lib/tiles.ts. Placement on the 4 x 3 grid is
// BoardScreen's job (lib/layout.ts); the span props here say the same shape.
// Big type comes from board.css.

export interface ClockTileProps {
  now: Date
  timeZone: string
  /** @deprecated the coordinates hint moved to Settings (5.13); ignored here. */
  showFallbackHint?: boolean
}

/** The clock (clockText) in very large type and the date (dateText) under it. */
export function ClockTile({ now, timeZone }: ClockTileProps): ReactNode {
  return (
    <Tile as="section" className="board-clock">
      <p className="board-clock__time">{clockText(now, timeZone)}</p>
      <p className="board-clock__date">{dateText(now, timeZone)}</p>
    </Tile>
  )
}

export interface TonightTileProps {
  slot: SlotLike | null
  /** Shows the big "Cook" button (76 px) with a Planned Meal; it starts Cook Mode. */
  onCook?: () => void
}

/**
 * The hero (2 x 2): heading "Tonight", the Recipe name, "<Meal Slot> · <time>" and the big "Cook" button when there is
 * a meal and a handler; "Nothing planned tonight" when null.
 */
export function TonightTile({ slot, onCook }: TonightTileProps): ReactNode {
  return (
    <Tile as="section" variant="hero" span={2} rowSpan={2} className="board-tonight">
      <h2 className="board-tile__heading">{boardStrings.tonight}</h2>
      {slot?.meal ? (
        <>
          <p className="board-tonight__recipe">{slot.meal.recipeName}</p>
          <p className="board-tonight__slot">{`${slot.name} · ${slot.time}`}</p>
          {onCook ? (
            <Button variant="secondary" size="xl" icon="cook" className="board-tonight__cook" onClick={onCook}>
              {boardStrings.cook}
            </Button>
          ) : null}
        </>
      ) : (
        <p>{boardStrings.tonightNone}</p>
      )}
    </Tile>
  )
}

export interface NextAdvanceTileProps {
  next: NextAdvance | null
  nowMs: number
  /** Marks it done (PUT /api/cook/marks) from the board. */
  onDone: (scope: string, step: number) => void
}

/** Heading "Next Advance Step", its text, the Recipe name, dueText; an "Overdue" spoil chip when overdue; a "Done" button. "Nothing to prepare ahead" when null. */
export function NextAdvanceTile({ next, nowMs, onDone }: NextAdvanceTileProps): ReactNode {
  return (
    <Tile as="section" variant={next?.overdue ? 'status' : 'surface'} status={next?.overdue ? 'spoil' : undefined} className="board-next">
      <h2 className="board-tile__heading">{boardStrings.nextAdvance}</h2>
      {next ? (
        <>
          <p className="board-next__text">{next.text}</p>
          <p className="board-next__recipe">{`${next.recipeName} · ${next.slotName}`}</p>
          <p className="board-next__due">
            {next.overdue ? <Chip kind="status" status="spoil">{boardStrings.overdue}</Chip> : boardStrings.due(dueText(next.dueAt, nowMs))}
          </p>
          <Button variant="secondary" onClick={() => onDone(next.scope, next.step)}>
            {boardStrings.markDone}
          </Button>
        </>
      ) : (
        <p>{boardStrings.nextAdvanceNone}</p>
      )}
    </Tile>
  )
}

/** Heading "Leftovers", one row per Leftover ("Stew · 2 portions · use by Thu"); "No Leftovers" when empty. Status leftover. */
export function BoardLeftoversTile({ rows }: { rows: LeftoverRow[] }): ReactNode {
  return (
    <Tile as="section" variant="status" status="leftover" className="board-leftovers">
      <h2 className="board-tile__heading">{boardStrings.leftovers}</h2>
      {rows.length === 0 ? (
        <p>{boardStrings.leftoversNone}</p>
      ) : (
        <ul className="board-list">
          {rows.map((r) => (
            <li key={r.id}>{`${r.recipeName} · ${boardStrings.portions(r.portions)} · use by ${shortWeekday(r.useBy)}`}</li>
          ))}
        </ul>
      )}
    </Tile>
  )
}

/** Heading "Use soon" (2 columns), one spoil status Chip per Ingredient; "Nothing to use up" when empty. */
export function UseSoonTile({ rows }: { rows: StockTotalLike[] }): ReactNode {
  return (
    <Tile as="section" span={2} className="board-use-soon">
      <h2 className="board-tile__heading">{boardStrings.useSoon}</h2>
      {rows.length === 0 ? (
        <p>{boardStrings.useSoonNone}</p>
      ) : (
        <ul className="board-chips">
          {rows.map((r) => (
            <li key={r.ingredientId}>
              <Chip kind="status" status="spoil">
                {r.name}
              </Chip>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  )
}

/** Heading "Timers", a TimerTile per timer (label, seconds, running = state running); "No timers running" when empty. Read-only: no handlers. */
export function BoardTimersTile({ items }: { items: TimerItem[] }): ReactNode {
  return (
    <Tile as="section" className="board-timers">
      <h2 className="board-tile__heading">{boardStrings.timers}</h2>
      {items.length === 0 ? (
        <p>{boardStrings.timersNone}</p>
      ) : (
        <ul className="board-list">
          {items.map(({ timer, seconds }) => (
            <li key={timer.id}>
              <TimerTile label={timer.label} seconds={seconds} running={timer.state === 'running'} />
            </li>
          ))}
        </ul>
      )}
    </Tile>
  )
}

/** Heading "Tomorrow", one line per Planned Meal ("Dinner · Chicken stew"); "Nothing planned tomorrow" when empty. */
export function TomorrowTile({ slots }: { slots: SlotLike[] }): ReactNode {
  return (
    <Tile as="section" className="board-tomorrow">
      <h2 className="board-tile__heading">{boardStrings.tomorrow}</h2>
      {slots.length === 0 ? (
        <p>{boardStrings.tomorrowNone}</p>
      ) : (
        <ul className="board-list">
          {slots.map((s) => (
            <li key={s.mealSlotId}>{`${s.name} · ${s.meal?.recipeName ?? ''}`}</li>
          ))}
        </ul>
      )}
    </Tile>
  )
}

/** Heading "Zero-waste streak" and "<n> days" ("1 day") in big type. */
export function StreakTile({ days }: { days: number }): ReactNode {
  return (
    <Tile as="section" className="board-streak">
      <h2 className="board-tile__heading">{boardStrings.streak}</h2>
      <p className="board-streak__days">{boardStrings.streakDays(days)}</p>
    </Tile>
  )
}
