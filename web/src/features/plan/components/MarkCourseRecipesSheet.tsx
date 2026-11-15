// B9-32 (PC-07, FLOW-18): "Mark Recipes as Dessert" without leaving the Plan: the context "Couldn't plan 7 Desserts", the lede,
// a search field, the Recipes not yet marked with the Course as our own checkbox rows, Cancel and the counting primary.
import { useId, type ReactNode } from 'react'
import { BottomSheet, Icon, SearchField, Skeleton } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import '../../../ui/fields/Checkbox.css'
import '../../../ui/ListRow.css'
import { useMarkCourseRecipes, type MarkCourse } from '../hooks/useMarkCourseRecipes'
import { pluralName } from '../lib/couldntGroups'
import type { MarkRow } from '../lib/markRecipes'
import { planStrings as s } from '../strings'
import '../plan.css'

export interface MarkCourseRecipesSheetProps {
  open: boolean
  onClose: () => void
  /** The Course to mark Recipes with. */
  course: MarkCourse
  /** How many meals could not be planned for it: the context line "Couldn't plan 7 Desserts" (none when 0). */
  count: number
}

/** One Recipe: a 44 px row whose whole area is our own checkbox (role checkbox, aria-checked), never the browser's. */
function CheckRow({ row, onToggle }: { row: MarkRow; onToggle: (id: number) => void }): ReactNode {
  const metaId = useId()
  return (
    <li className="list-row mark-recipes__row" data-height="64">
      <button
        type="button"
        role="checkbox"
        aria-checked={row.checked}
        className="list-row__target"
        aria-label={row.name}
        aria-describedby={metaId}
        onClick={() => onToggle(row.id)}
      />
      <span className="list-row__control">
        <span className="checkbox__box" data-state={row.checked ? 'checked' : 'unchecked'} aria-hidden="true">
          {row.checked ? <Icon name="tick" size={16} /> : null}
        </span>
      </span>
      <span className="list-row__text">
        <span className="list-row__title">{row.name}</span>
        <span id={metaId} className="list-row__meta">
          <span className="list-row__meta-text">{row.meta}</span>
        </span>
      </span>
    </li>
  )
}

function SheetBody({ onClose, course, count }: Omit<MarkCourseRecipesSheetProps, 'open'>): ReactNode {
  const m = useMarkCourseRecipes(course)
  const formId = useId()
  const submit = async () => {
    if (await m.mark()) onClose()
  }
  return (
    <BottomSheet
      open
      onClose={onClose}
      onCancel={onClose}
      title={s.markRecipesAs(course.name)}
      submit={{ label: s.markSheet.primary(m.count, course.name), form: formId, disabled: m.count === 0, loading: m.saving }}
    >
      <form
        id={formId}
        className="mark-recipes"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {/* The context line sits at the top of the body: BottomSheet's own `context` would join the dialog's name. */}
        {count > 0 ? <p className="mark-recipes__context">{s.markSheet.context(count, count === 1 ? course.name : pluralName(course.name))}</p> : null}
        <p className="mark-recipes__lede">{s.markSheet.lede(course.name)}</p>
        <FormError>{m.error}</FormError>
        {m.status === 'loading' ? (
          <Skeleton variant="row" count={3} label={s.markSheet.loading} />
        ) : m.status === 'error' ? (
          <FormError>{s.markSheet.loadFailed}</FormError>
        ) : m.total === 0 ? (
          <p className="mark-recipes__empty">{s.markSheet.allMarked(course.name)}</p>
        ) : (
          <>
            <SearchField label={s.markSheet.search} value={m.search} onChange={m.setSearch} />
            {m.rows.length === 0 ? (
              <p className="mark-recipes__empty">{s.markSheet.noMatch}</p>
            ) : (
              <ul className="list-group__list mark-recipes__list" aria-label={s.markRecipesAs(course.name)}>
                {m.rows.map((row) => (
                  <CheckRow key={row.id} row={row} onToggle={m.toggle} />
                ))}
              </ul>
            )}
          </>
        )}
      </form>
    </BottomSheet>
  )
}

export function MarkCourseRecipesSheet({ open, ...rest }: MarkCourseRecipesSheetProps): ReactNode {
  // A fresh body per opening: the ticks, the search and the refusal start over.
  return open ? <SheetBody {...rest} /> : null
}
