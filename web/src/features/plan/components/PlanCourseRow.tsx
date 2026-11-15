import { useContext, type ReactNode } from 'react'
import { Chip, Icon, IconButton, ListRow } from '../../../ui'
import { IconSet } from '../../../ui/IconSet'
import { ReplanMarksContext } from '../hooks/useReplanReview'
import { markKey } from '../lib/replan'
import type { CourseRowModel } from '../lib/courses'
import { rowKey } from '../lib/rowFocus'
import type { RowChip } from '../lib/rowChips'
import { usePlanCourseRow, type PlanCourseRowView } from '../hooks/usePlanCourseRow'
import './PlanCourseRow.changed.css'
import type { PlanSlot, SlotKey } from '../types'

export interface PlanCourseRowProps {
  row: CourseRowModel
  slot: PlanSlot
  /** Household date (the row's chips are phrased for the slot's date; kept for the sheet's Cook rules). */
  today: string
  onOpen: (key: SlotKey) => void
  onSwap: (key: SlotKey) => void
  onPin: (key: SlotKey) => void
  onUnpin: (key: SlotKey) => void
  onChoose: (key: SlotKey) => void
}

/**
 * One Course of a Meal Slot on a day tile, built on ListRow (docs/design/system.md §3, §6): the Course label in the meta
 * line, the Recipe as the title (the whole row opens its sheet), Swap and Pin in an IconSet at the end, and the chips on
 * their own line under it all, whole or counted in "+N" (PC-06). An empty Course is a dashed row titled "Not planned"
 * (or "Nothing planned"), its Course in the meta, its cause as the one chip and one trailing Choose a Recipe (PC-07).
 * The `li` carries data-row-key, so a screen can put focus back on it (lib/rowFocus).
 */
export function PlanCourseRow({ row, slot, onOpen, onSwap, onPin, onUnpin, onChoose }: PlanCourseRowProps): ReactNode {
  const { course, key, caption } = row
  const meal = course.meal
  const view = usePlanCourseRow(row, slot)
  // Ids from the cell (one row per cell on the Plan), so the markup is the same on every render.
  const idBase = `plan-row-${rowKey(key).replaceAll('/', '-')}`
  const whenId = `${idBase}-when`
  const chipsId = `${idBase}-chips`
  // B9-26 (PC-01): a row the last edit changed carries data-changed and "was Lentil soup" (part of its accessible name).
  const was = useContext(ReplanMarksContext)[markKey(key)]
  const wasMeta = was ? (
    <span className="plan-row__was">
      <Icon name="refresh" size={14} />
      {was}
    </span>
  ) : null
  const line = chipLine(view, chipsId)

  if (meal) {
    const meta = wasMeta ? (caption ? <>{caption} · {wasMeta}</> : wasMeta) : (caption ?? undefined)
    const pinned = meal.pinned
    // A11Y-08: the day and Meal Slot describe the target, so the same Recipe on two days reads differently.
    const when = (
      <span id={whenId} className="visually-hidden">
        {view.when}
      </span>
    )
    const trailing = (
      <>
        {view.actions.length > 0 ? (
          <IconSet>
            <IconButton icon="swap" label={view.names.swap} size="compact" onClick={() => onSwap(key)} />
            <IconButton icon="pin" label={view.names.pin} size="compact" pressed={pinned} onClick={() => (pinned ? onUnpin(key) : onPin(key))} />
          </IconSet>
        ) : null}
        {when}
      </>
    )
    return (
      <ListRow
        title={meal.recipeName}
        aria-label={was ? `${meal.recipeName}, ${was}` : undefined}
        aria-describedby={whenId}
        onActivate={() => onOpen(key)}
        meta={meta}
        trailing={trailing}
        below={line}
        wrapTitle
        data-row-key={rowKey(key)}
        data-state={meal.state !== 'planned' ? meal.state : undefined}
        data-changed={was ? '' : undefined}
      />
    )
  }
  const courseMeta = caption ?? course.name
  const meta = wasMeta ? (
    <>
      {courseMeta} · {wasMeta}
    </>
  ) : (
    courseMeta
  )
  const choosable = view.empty?.canChoose ?? true
  return (
    <ListRow
      title={view.empty?.title ?? ''}
      meta={meta}
      trailing={
        choosable ? <IconButton icon="search" label={view.names.choose} aria-describedby={line ? chipsId : undefined} onClick={() => onChoose(key)} /> : undefined
      }
      below={line}
      wrapTitle
      data-row-key={rowKey(key)}
      data-unfilled=""
      data-changed={was ? '' : undefined}
    />
  )
}

/** PC-06: the visible chip line (only the chips that fit whole, then "+N") and the hidden copy of every chip it is measured by. */
function chipLine(view: PlanCourseRowView, id: string): ReactNode {
  if (view.all.length === 0) return null
  return (
    <>
      <div id={id} className="plan-row__chips" ref={view.lineRef} data-cut={view.cut ? 'true' : undefined}>
        {view.chips.map(chipOf)}
        {view.more ? (
          <Chip kind="count" title={view.more.title} label={`${view.more.label}: ${view.more.title}`}>
            {view.more.label}
          </Chip>
        ) : null}
      </div>
      {view.measuring ? (
        <div className="plan-row__measure-box" aria-hidden="true">
          <div className="plan-row__measure" aria-hidden="true" ref={view.measureRef}>
            {view.all.map(chipOf)}
          </div>
        </div>
      ) : null}
    </>
  )
}

function chipOf(c: RowChip): ReactNode {
  return (
    <Chip key={c.key} kind={c.kind} status={c.status} outline={c.outline} icon={c.icon} title={c.title}>
      {c.label}
    </Chip>
  )
}
