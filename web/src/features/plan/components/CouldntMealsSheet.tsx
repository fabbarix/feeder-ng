// B9-32 (PC-07): the sheet "Show which meals" opens: one section per cause (the tile row's title, its long explanation once
// and the summary line), then the affected meals by day, each with its own Choose a Recipe.
import { useId, type ReactNode } from 'react'
import { BottomSheet, IconButton, ListRow } from '../../../ui'
import type { NoticeGroup } from '../hooks/useCouldntPlanNotice'
import { mealsByDay, type CouldntMeal } from '../lib/couldntGroups'
import { planStrings as s } from '../strings'
import type { SlotKey } from '../types'
import '../plan.css'

export interface CouldntMealsSheetProps {
  open: boolean
  onClose: () => void
  groups: NoticeGroup[]
  /** "Choose a Recipe" on one meal: opens the Recipe chooser for that Course. */
  onChoose: (key: SlotKey) => void
}

function MealRow({ meal, onChoose }: { meal: CouldntMeal; onChoose: (key: SlotKey) => void }): ReactNode {
  const choose = meal.chooseLabel ? (
    <IconButton icon="search" label={meal.chooseLabel} onClick={() => onChoose(meal.key)} />
  ) : undefined
  if (meal.to) {
    return <ListRow title={meal.slotName} aria-label={meal.linkLabel} href={meal.to} meta={meal.courseName ?? undefined} trailing={choose} />
  }
  return <ListRow title={meal.slotName} meta={meal.courseName ?? undefined} trailing={choose} />
}

function CauseSection({ group, onChoose }: { group: NoticeGroup; onChoose: (key: SlotKey) => void }): ReactNode {
  const id = useId()
  return (
    <section className="couldnt-meals__cause" aria-labelledby={id} data-tone={group.tone}>
      <h3 id={id} className="couldnt-meals__title">
        {group.title}
      </h3>
      <p className="couldnt-meals__summary">{group.summary}</p>
      <p className="couldnt-meals__hint">{group.canFix ? group.hint : `${group.hint} ${s.couldntAskAdmin}`}</p>
      {mealsByDay(group).map((day) => (
        <div key={day.date} className="couldnt-meals__day">
          <p className="couldnt-meals__day-title" aria-hidden="true">
            {day.label}
          </p>
          <ul className="list-group__list couldnt-meals__list" aria-label={day.label}>
            {day.meals.map((m) => (
              <MealRow key={m.id} meal={m} onChoose={onChoose} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

/** The affected meals by cause and day, each with Choose a Recipe; it also holds the long explanation the tile leaves out. */
export function CouldntMealsSheet({ open, onClose, groups, onChoose }: CouldntMealsSheetProps): ReactNode {
  return (
    <BottomSheet open={open} onClose={onClose} title={s.couldntPlanTitle}>
      <div className="couldnt-meals">
        {groups.map((g) => (
          <CauseSection key={g.cause} group={g} onChoose={onChoose} />
        ))}
      </div>
    </BottomSheet>
  )
}
