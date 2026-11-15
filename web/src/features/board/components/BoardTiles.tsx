import { Fragment, useId, type ReactNode } from 'react'
import type { TimerItem } from '../../cook/hooks/useTimers'
import { Button, Chip, Tile } from '../../../ui'
import { useFitRows } from '../hooks/useFitRows'
import { eyebrowParts, type BoardHero } from '../lib/hero'
import { advanceDoneName, clockText, dateText, dueText, nextAdvanceMeal, notServedLine, tomorrowLine, type LeftoverRow } from '../lib/tiles'
import { boardStrings } from '../strings'
import type { NextAdvance, SlotLike, StockTotalLike } from '../types'
import { LeftoverList, TimerList, TomorrowList, TonightCourses, UseSoonChips } from './BoardLists'

// The kitchen board's tiles, composed from the shared Bento primitives (Tile, Chip, TimerTile, Button). Each renders its data and
// wires events only; all choosing and wording lives in lib/. Placement on the grid is BoardScreen's job (lib/layout.ts). Every tile
// with a heading is a section named by it (TB-07). The type is the board roles in board.css (TB-07).

/** A tile heading with the id its section is named by. */
function Heading({ id, children }: { id: string; children: ReactNode }): ReactNode {
  return (
    <h2 className="board-tile__heading" id={id}>
      {children}
    </h2>
  )
}

export interface ClockTileProps {
  now: Date
  timeZone: string
  /** B9-47 (TB-04): the Close control, drawn at the top end of the tile beside the date. */
  close?: ReactNode
  /** @deprecated the coordinates hint moved to Settings (5.13); ignored here. */
  showFallbackHint?: boolean
}

/** The date (dateText) at the top beside the Close control, and the clock (clockText) in very large type under them. */
export function ClockTile({ now, timeZone, close }: ClockTileProps): ReactNode {
  return (
    <Tile as="section" className="board-clock">
      <div className="board-clock__top">
        <p className="board-clock__date">{dateText(now, timeZone)}</p>
        {close}
      </div>
      <p className="board-clock__time">{clockText(now, timeZone)}</p>
    </Tile>
  )
}

export interface BoardHeroTileProps {
  hero: BoardHero | null
  /** the slots Not served today (lib/tiles tonightNotServed): with no hero the tile says "Dinner · Not served" for each */
  notServed?: SlotLike[]
  onCook?: () => void
}

/**
 * The hero (TB-07, TB-08, decision TB 7): Today's eyebrow with its day word ("Today · Dinner · start 13:00"), in parts that wrap only
 * between them; the Recipe name of a one-Course slot, or a row per Course with a Planned Meal (the main one larger); the start line
 * ("Start 13:00 · ready 19:00"); and ONE big Cook button for the slot. With no hero: "Dinner · Not served" per slot Not served today,
 * else "Nothing planned".
 */
export function BoardHeroTile({ hero, notServed = [], onCook }: BoardHeroTileProps): ReactNode {
  const id = useId()
  const parts = eyebrowParts(hero?.eyebrow ?? [boardStrings.today])
  const rows = hero?.rows ?? []
  return (
    <Tile as="section" variant="hero" span={2} rowSpan={2} className="board-tonight" aria-labelledby={id}>
      <p className="board-eyebrow" id={id}>
        {parts.map((part, i) => (
          <Fragment key={part.text}>
            {i > 0 ? ' ' : null}
            <span className={part.start ? 'board-eyebrow__part board-eyebrow__start' : 'board-eyebrow__part'} data-now={part.now ? 'true' : undefined}>
              {part.sep}
              <span className="board-eyebrow__text">{part.label}</span>
            </span>
          </Fragment>
        ))}
      </p>
      {hero ? (
        <>
          {rows.length > 1 ? (
            <TonightCourses rows={rows} />
          ) : rows[0] ? (
            <p className="board-tonight__recipe">{rows[0].recipeName}</p>
          ) : null}
          {hero.startLine ? <p className="board-tonight__slot">{hero.startLine}</p> : null}
          {onCook ? (
            <Button variant="primary" size="xl" icon="cook" className="board-tonight__cook" aria-label={boardStrings.cookName(hero.slot.name)} onClick={onCook}>
              {boardStrings.cook}
            </Button>
          ) : null}
        </>
      ) : notServed.length > 0 ? (
        notServed.map((s) => (
          <p key={s.mealSlotId} className="board-tonight__slot">
            {notServedLine(s)}
          </p>
        ))
      ) : (
        <p className="board-tonight__slot">{boardStrings.heroNone}</p>
      )}
    </Tile>
  )
}

export interface NextAdvanceTileProps {
  next: NextAdvance | null
  nowMs: number
  /** Household IANA zone, for the "Sat 11:30" form beyond 24 h (R11b N7). */
  timeZone?: string
  /** Marks it done (PUT /api/cook/marks) from the board. */
  onDone: (scope: string, step: number) => void
}

/**
 * Next Advance Step, always an info status tile (decision DS 3), overdue or not (TB-07): the Step text (2 lines), its meal
 * ("Tue Dinner · <Recipe>"), and a foot row with the due state ("Start in 3 h", or the info "Overdue" chip) and Done, named
 * "Done: <Step text>". "Nothing to prepare ahead" when there is none.
 */
export function NextAdvanceTile({ next, nowMs, timeZone, onDone }: NextAdvanceTileProps): ReactNode {
  const id = useId()
  return (
    <Tile as="section" variant="status" status="info" className="board-next" aria-labelledby={id}>
      <Heading id={id}>{boardStrings.nextAdvance}</Heading>
      {next ? (
        <>
          <p className="board-next__text">{next.text}</p>
          <p className="board-next__recipe">{nextAdvanceMeal(next)}</p>
          <div className="board-next__foot">
            <p className="board-next__due">
              {next.overdue ? (
                <Chip kind="status" status="info" overdue whole icon="advanceStep">
                  {boardStrings.overdue}
                </Chip>
              ) : (
                boardStrings.due(dueText(next.dueAt, nowMs, timeZone))
              )}
            </p>
            <Button variant="secondary" size="lg" icon="tick" className="board-next__done" aria-label={advanceDoneName(next, [next])} onClick={() => onDone(next.scope, next.step)}>
              {boardStrings.markDone}
            </Button>
          </div>
        </>
      ) : (
        <p className="board-empty">{boardStrings.nextAdvanceNone}</p>
      )}
    </Tile>
  )
}

/** Heading "Leftovers", one row per Leftover: the name over "Use by Tue · 1.25 portions" (or "Use-by passed"); "No Leftovers" when empty. */
export function BoardLeftoversTile({ rows, today }: { rows: LeftoverRow[]; today: string }): ReactNode {
  const id = useId()
  const fit = useFitRows<HTMLUListElement>(rows.length, rows.map((r) => `${r.id}:${r.recipeName}:${r.useBy}`).join('|'))
  const hidden = rows.length - fit.shown
  return (
    <Tile as="section" variant="status" status="leftover" className="board-leftovers" aria-labelledby={id}>
      <Heading id={id}>{boardStrings.leftovers}</Heading>
      {rows.length === 0 ? (
        <p className="board-empty">{boardStrings.leftoversNone}</p>
      ) : (
        <LeftoverList listRef={fit.ref} rows={rows.slice(0, fit.shown)} today={today} />
      )}
      {hidden > 0 ? <p className="board-more">{boardStrings.more(hidden)}</p> : null}
    </Tile>
  )
}

/** Heading "Use soon" (2 columns), one spoil status Chip per Ingredient, "Flour · tomorrow"; "Nothing to use up" when empty. */
export function UseSoonTile({ rows, today }: { rows: StockTotalLike[]; today: string }): ReactNode {
  const id = useId()
  const fit = useFitRows<HTMLUListElement>(rows.length, rows.map((r) => `${r.ingredientId}:${r.name}:${r.nextGoesOff}`).join('|'))
  const hidden = rows.length - fit.shown
  return (
    <Tile as="section" span={2} className="board-use-soon" aria-labelledby={id}>
      <Heading id={id}>{boardStrings.useSoon}</Heading>
      {rows.length === 0 ? (
        <p className="board-empty">{boardStrings.useSoonNone}</p>
      ) : (
        <UseSoonChips listRef={fit.ref} rows={rows.slice(0, fit.shown)} today={today} hidden={hidden} />
      )}
    </Tile>
  )
}

/** Most timers the board lists; the rest become a "+n more" line so no row is clipped in the cell. */
export const BOARD_TIMER_CAP = 2

/**
 * Heading "Timers", a TimerTile per timer (label, seconds, running = state running), at most BOARD_TIMER_CAP of them and no more than
 * the tile shows whole (items are already soonest first), then "+n more" for the rest; "No timers running" when empty. Read-only: no handlers.
 */
export function BoardTimersTile({ items }: { items: TimerItem[] }): ReactNode {
  const id = useId()
  const capped = Math.min(items.length, BOARD_TIMER_CAP)
  const fit = useFitRows<HTMLUListElement>(capped, items.map((i) => i.timer.id).join('|'))
  const shown = items.slice(0, fit.shown)
  const hidden = items.length - shown.length
  return (
    <Tile as="section" className="board-timers" aria-labelledby={id}>
      <Heading id={id}>{boardStrings.timers}</Heading>
      {items.length === 0 ? (
        <p className="board-empty">{boardStrings.timersNone}</p>
      ) : (
        <>
          <TimerList listRef={fit.ref} items={shown} />
          {hidden > 0 ? <p className="board-timers__more">{boardStrings.more(hidden)}</p> : null}
        </>
      )}
    </Tile>
  )
}

/** Heading "Tomorrow", one line per Meal Slot/** Heading "Tomorrow", one line per Meal Slot ("Dinner: X + Y", spec 7.5), each ending in an ellipsis with the full text in `title`. */
export function TomorrowTile({ slots }: { slots: SlotLike[] }): ReactNode {
  const id = useId()
  const fit = useFitRows<HTMLUListElement>(slots.length, slots.map(tomorrowLine).join('|'))
  const hidden = slots.length - fit.shown
  return (
    <Tile as="section" className="board-tomorrow" aria-labelledby={id}>
      <Heading id={id}>{boardStrings.tomorrow}</Heading>
      {slots.length === 0 ? (
        <p className="board-empty">{boardStrings.tomorrowNone}</p>
      ) : (
        <TomorrowList listRef={fit.ref} slots={slots.slice(0, fit.shown)} />
      )}
      {hidden > 0 ? <p className="board-more">{boardStrings.more(hidden)}</p> : null}
    </Tile>
  )
}

/** Heading "Zero-waste streak" and "<n> days" ("1 day", "0 days": decision TB 3) in big type. */
export function StreakTile({ days }: { days: number }): ReactNode {
  const id = useId()
  return (
    <Tile as="section" className="board-streak" aria-labelledby={id}>
      <Heading id={id}>{boardStrings.streak}</Heading>
      <p className="board-streak__days">{boardStrings.streakDays(days)}</p>
    </Tile>
  )
}
