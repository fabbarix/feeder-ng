import { useContext, type ReactNode } from 'react'
import { Chip, Icon, IconButton, ListRow } from '../../../ui'
import { ReplanMarksContext } from '../hooks/useReplanReview'
import { markKey } from '../lib/replan'
import type { CourseRowModel } from '../lib/courses'
import type { RowAction } from '../lib/rowActions'
import type { RowChip } from '../lib/rowChips'
import { usePlanCourseRow } from '../hooks/usePlanCourseRow'
import { planStrings as s } from '../strings'
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
 * line, the Recipe as the title (the whole row opens its sheet), one line of chips, and Swap and Pin at the end. An empty
 * Course is a dashed row whose whole target is "Choose a Recipe", titled by its short reason.
 */
export function PlanCourseRow({ row, slot, onOpen, onSwap, onPin, onUnpin, onChoose }: PlanCourseRowProps): ReactNode {
  const { course, key, caption } = row
  const meal = course.meal
  const { chips, more, actions, empty } = usePlanCourseRow(row, slot)
  // B9-26 (PC-01): a row the last edit changed carries data-changed and "was Lentil soup" (part of its accessible name).
  const was = useContext(ReplanMarksContext)[markKey(key)]
  const wasMeta = was ? (
    <span className="plan-row__was">
      <Icon name="refresh" size={14} />
      <span className="plan-row__was-text">{was}</span>
    </span>
  ) : null
  const meta = wasMeta ? (caption ? <>{caption} · {wasMeta}</> : wasMeta) : (caption ?? undefined)
  const shown: RowChip[] = empty ? (empty.chip ? [empty.chip] : []) : chips
  // Round 2: at most two chips show; the rest collapse into one neutral "+N" chip whose title and name list them.
  const chipLine =
    shown.length > 0 || more ? (
      <div className="plan-row__chips">
        {shown.map((c) => (
          <Chip key={c.key} kind={c.kind} status={c.status} outline={c.outline} icon={c.icon}>
            {c.label}
          </Chip>
        ))}
        {more ? (
          <Chip kind="count" title={more.title} label={`${more.label}: ${more.title}`}>
            {more.label}
          </Chip>
        ) : null}
      </div>
    ) : undefined
  const trailing = actions.length > 0 ? <span className="plan-row__actions">{actions.map((a) => actionButton(a, key, onSwap, onPin, onUnpin))}</span> : undefined

  if (meal) {
    return (
      <ListRow
        title={meal.recipeName}
        aria-label={was ? `${meal.recipeName}, ${was}` : undefined}
        onActivate={() => onOpen(key)}
        meta={meta}
        trailing={trailing}
        wrapTitle
        data-state={meal.state !== 'planned' ? meal.state : undefined}
        data-changed={was ? '' : undefined}
      >
        {chipLine}
      </ListRow>
    )
  }
  const choosable = empty?.canChoose ?? true
  return (
    <ListRow
      title={empty?.title ?? s.nothingPlanned}
      aria-label={choosable ? (was ? `${s.choose}, ${was}` : s.choose) : undefined}
      onActivate={choosable ? () => onChoose(key) : undefined}
      meta={meta}
      wrapTitle
      data-unfilled=""
      data-changed={was ? '' : undefined}
    >
      {chipLine}
    </ListRow>
  )
}

function actionButton(action: RowAction, key: SlotKey, onSwap: (k: SlotKey) => void, onPin: (k: SlotKey) => void, onUnpin: (k: SlotKey) => void): ReactNode {
  if (action === 'swap') return <IconButton key="swap" icon="swap" label={s.swap} size="compact" onClick={() => onSwap(key)} />
  if (action === 'pin') return <IconButton key="pin" icon="pin" label={s.pin} size="compact" onClick={() => onPin(key)} />
  return <IconButton key="unpin" icon="unpin" label={s.unpin} size="compact" onClick={() => onUnpin(key)} />
}
