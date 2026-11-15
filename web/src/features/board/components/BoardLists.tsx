// The lists inside the kitchen board's tiles (BoardTiles): the hero's Courses, Leftovers, Use soon chips, timers and Tomorrow's lines.
// Split out of the tile file (B9-55): rows, chips and timer tiles, not bullet sentences. Each renders its data only; the tile measures
// how many fit (useFitRows) and passes its ref and the rows that fit.
import type { ReactNode, RefObject } from 'react'
import type { TimerItem } from '../../cook/hooks/useTimers'
import { Chip, TimerTile } from '../../../ui'
import { hasPlanned, leftoverLine, plannedNames, tomorrowLine, useSoonChip, type LeftoverRow, type TonightRow } from '../lib/tiles'
import { boardStrings } from '../strings'
import type { SlotLike, StockTotalLike } from '../types'

type ListRef = RefObject<HTMLUListElement | null>

/** The hero's Courses with a Planned Meal, the main one larger. */
export function TonightCourses({ rows }: { rows: TonightRow[] }): ReactNode {
  return (
    <ul aria-label={boardStrings.courses} className="board-tonight__courses">
      {rows.map((row) => (
        <li key={row.courseId} data-main={row.main ? 'true' : undefined} data-state={row.state} className="board-tonight__course">
          {row.recipeName}
        </li>
      ))}
    </ul>
  )
}

/** One row per Leftover: the name over "Use by Tue · 1.25 portions". */
export function LeftoverList({ listRef, rows, today }: { listRef: ListRef; rows: LeftoverRow[]; today: string }): ReactNode {
  return (
    <ul className="board-list" ref={listRef}>
      {rows.map((r) => {
        const line = leftoverLine(r, today)
        return (
          <li key={r.id}>
            <span className="board-list__title">{line.title}</span>
            <span className="board-list__meta">{line.meta}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** One spoil status Chip per Ingredient ("Flour · tomorrow"), then "+n more". */
export function UseSoonChips({ listRef, rows, today, hidden }: { listRef: ListRef; rows: StockTotalLike[]; today: string; hidden: number }): ReactNode {
  return (
    <ul className="board-chips" ref={listRef}>
      {rows.map((r) => {
        const chip = useSoonChip(r, today)
        return (
          <li key={r.ingredientId}>
            <Chip kind="status" status="spoil" label={chip.name}>
              {chip.label}
            </Chip>
          </li>
        )
      })}
      {hidden > 0 ? <li className="board-chips__more">{boardStrings.more(hidden)}</li> : null}
    </ul>
  )
}

/** A read-only TimerTile per timer. */
export function TimerList({ listRef, items }: { listRef: ListRef; items: TimerItem[] }): ReactNode {
  return (
    <ul className="board-list" ref={listRef}>
      {items.map(({ timer, seconds }) => (
        <li key={timer.id}>
          <TimerTile label={timer.label} seconds={seconds} running={timer.state === 'running'} />
        </li>
      ))}
    </ul>
  )
}

/** One Tomorrow line per Meal Slot, each ending in an ellipsis with the full text in `title`. */
export function TomorrowList({ listRef, slots }: { listRef: ListRef; slots: SlotLike[] }): ReactNode {
  return (
    <ul className="board-list board-list--lines" ref={listRef}>
      {slots.map((s) => (
        <li key={`${s.date}/${s.mealSlotId}`} title={tomorrowLine(s)}>
          <TomorrowLine slot={s} />
        </li>
      ))}
    </ul>
  )
}

/** One Tomorrow line: the Meal Slot in bold, then its Recipes, "Not served", or a neutral "Not planned" chip (R13, read-only). */
function TomorrowLine({ slot }: { slot: SlotLike }): ReactNode {
  if (slot.notServed === true) {
    return (
      <>
        <strong>{slot.name}</strong> · {boardStrings.notServed}
      </>
    )
  }
  if (hasPlanned(slot)) {
    return (
      <>
        <strong>{`${slot.name}:`}</strong> {plannedNames(slot).join(' + ')}
      </>
    )
  }
  return (
    <>
      <strong>{slot.name}</strong> <Chip kind="tag">{boardStrings.notPlanned}</Chip>
    </>
  )
}
