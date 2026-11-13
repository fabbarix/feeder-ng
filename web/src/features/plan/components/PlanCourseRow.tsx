import type { ReactNode } from 'react'
import { Chip, IconButton, ListRow } from '../../../ui'
import type { CourseRowModel } from '../lib/courses'
import type { RowAction } from '../lib/rowActions'
import type { RowChip } from '../lib/rowChips'
import { usePlanCourseRow } from '../hooks/usePlanCourseRow'
import { planStrings as s } from '../strings'
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
  const { chips, actions, empty } = usePlanCourseRow(row, slot)
  const shown: RowChip[] = empty ? (empty.chip ? [empty.chip] : []) : chips
  const chipLine =
    shown.length > 0 ? (
      <div className="plan-row__chips">
        {shown.map((c) => (
          <Chip key={c.key} kind={c.kind} status={c.status} outline={c.outline} icon={c.icon}>
            {c.label}
          </Chip>
        ))}
      </div>
    ) : undefined
  const trailing = actions.length > 0 ? <span className="plan-row__actions">{actions.map((a) => actionButton(a, key, onSwap, onPin, onUnpin))}</span> : undefined

  if (meal) {
    return (
      <ListRow
        title={meal.recipeName}
        onActivate={() => onOpen(key)}
        meta={caption ?? undefined}
        trailing={trailing}
        data-state={meal.state !== 'planned' ? meal.state : undefined}
      >
        {chipLine}
      </ListRow>
    )
  }
  const choosable = empty?.canChoose ?? true
  return (
    <ListRow
      title={empty?.title ?? s.nothingPlanned}
      aria-label={choosable ? s.choose : undefined}
      onActivate={choosable ? () => onChoose(key) : undefined}
      meta={caption ?? undefined}
      data-unfilled=""
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
