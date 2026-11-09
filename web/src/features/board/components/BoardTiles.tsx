import type { ReactNode } from 'react'
import type { TimerItem } from '../../cook/hooks/useTimers'
import { Button, Chip, Tile, TimerTile } from '../../../ui'
import { clockText, dateText, dueText, shortWeekday, type LeftoverRow } from '../lib/tiles'
import { boardStrings } from '../strings'
import type { NextAdvance, SlotLike, StockTotalLike } from '../types'

// The kitchen board's tiles, composed from the shared Bento primitives (Tile,
// Chip, TimerTile, Button). Each renders its data and wires events only; all
// choosing and formatting lives in lib/tiles.ts. Big type comes from board.css.

export interface ClockTileProps {
  now: Date
  timeZone: string
  /** True when the dark/light switch uses the 19:00-07:00 fallback: shows a small Chip with strings.fallbackHint. */
  showFallbackHint: boolean
}

/** The clock (clockText) in very large type, the date (dateText) under it, and the fallback hint Chip when asked. */
export function ClockTile({ now, timeZone, showFallbackHint }: ClockTileProps): ReactNode {
  return (
    <Tile as="section" size="wide" className="board-clock">
      <p className="board-clock__time">{clockText(now, timeZone)}</p>
      <p className="board-clock__date">{dateText(now, timeZone)}</p>
      {showFallbackHint ? <Chip>{boardStrings.fallbackHint}</Chip> : null}
    </Tile>
  )
}

export interface TonightTileProps {
  slot: SlotLike | null
}

/** Heading "Tonight", the Recipe name, and "<Meal Slot> · <time>"; "Nothing planned tonight" when null. */
export function TonightTile({ slot }: TonightTileProps): ReactNode {
  return (
    <Tile as="section" size="wide" tone="accent" className="board-tonight">
      <h2 className="board-tile__heading">{boardStrings.tonight}</h2>
      {slot?.meal ? (
        <>
          <p className="board-tonight__recipe">{slot.meal.recipeName}</p>
          <p className="board-tonight__slot">{`${slot.name} · ${slot.time}`}</p>
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

/** Heading "Next Advance Step", its text, the Recipe name, dueText; an "Overdue" Chip (spoil tone) when overdue; a "Done" button. "Nothing to prepare ahead" when null. */
export function NextAdvanceTile({ next, nowMs, onDone }: NextAdvanceTileProps): ReactNode {
  return (
    <Tile as="section" tone={next?.overdue ? 'spoil' : 'neutral'} className="board-next">
      <h2 className="board-tile__heading">{boardStrings.nextAdvance}</h2>
      {next ? (
        <>
          <p className="board-next__text">{next.text}</p>
          <p className="board-next__recipe">{`${next.recipeName} · ${next.slotName}`}</p>
          <p className="board-next__due">
            {next.overdue ? <Chip tone="spoil">{boardStrings.overdue}</Chip> : boardStrings.due(dueText(next.dueAt, nowMs))}
          </p>
          <Button variant="tonal" onClick={() => onDone(next.scope, next.step)}>
            {boardStrings.markDone}
          </Button>
        </>
      ) : (
        <p>{boardStrings.nextAdvanceNone}</p>
      )}
    </Tile>
  )
}

/** Heading "Leftovers", one row per Leftover ("Stew · 2 portions · use by Thu"); "No Leftovers" when empty. Tone leftover. */
export function BoardLeftoversTile({ rows }: { rows: LeftoverRow[] }): ReactNode {
  return (
    <Tile as="section" tone="leftover" className="board-leftovers">
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

/** Heading "Use soon", one spoil-tone Chip per Ingredient; "Nothing to use up" when empty. */
export function UseSoonTile({ rows }: { rows: StockTotalLike[] }): ReactNode {
  return (
    <Tile as="section" className="board-use-soon">
      <h2 className="board-tile__heading">{boardStrings.useSoon}</h2>
      {rows.length === 0 ? (
        <p>{boardStrings.useSoonNone}</p>
      ) : (
        <ul className="board-chips">
          {rows.map((r) => (
            <li key={r.ingredientId}>
              <Chip tone="spoil">{r.name}</Chip>
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
    <Tile as="section" size="wide" className="board-tomorrow">
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

export interface StartCookTileProps {
  /** Undefined disables the button (nothing planned). */
  onStart?: () => void
}

/** The big button "Start Cook Mode" (a Tile with onClick; disabled without onStart). */
export function StartCookTile({ onStart }: StartCookTileProps): ReactNode {
  return (
    <Tile as="section" tone="accent" className="board-start">
      <Button size="lg" className="board-start__button" disabled={!onStart} onClick={onStart}>
        {boardStrings.startCooking}
      </Button>
    </Tile>
  )
}
