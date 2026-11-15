import { useRef, useState, type ReactNode } from 'react'
import { BottomSheet, Chip, ListGroup, ListRow, RecipeThumb, SearchField } from '../../../ui'
import { formatMinutes } from '../../../lib/time/formatMinutes'
import { useFinePointer } from '../hooks/useFinePointer'
import { useSheetTitleFocus } from '../hooks/useSheetTitleFocus'
import { chooseGroups, chooserContext, matchRecipes, sheetCourse } from '../lib/choose'
import { planStrings as s } from '../strings'
import type { PlanSlot, RecipeChoice } from '../types'
import { leftoverStrings } from '../../../lib/leftovers/copy'
import { freezerChoices, type FreezerChoice } from '../../../lib/leftovers/rows'
import type { Leftover } from '../../../lib/leftovers/types'
import '../plan.css'

export interface RecipeChooserSheetProps {
  open: boolean
  onClose: () => void
  recipes: RecipeChoice[]
  isLoading: boolean
  onPick: (recipeId: number) => void
  /** B5-LOW: the frozen Leftovers (any Recipe; only those of the Recipes offered are listed). */
  frozenLeftovers?: Leftover[]
  /** B5-LOW: a frozen Leftover was chosen: the Planned Meal is pinned to it, not to its Recipe. */
  onPickLeftover?: (leftoverId: number) => void
  /** B9-38 (PC-10): the slot and the Course the Recipe is for: the context line, the search label and the groups. */
  slot?: PlanSlot | null
  courseId?: number
  /** B9-38: a Recipe of "Other Recipes" was chosen: it is planned and marked for the Course in one write. Default: `onPick`. */
  onPickOther?: (recipeId: number) => void
}

/**
 * Bottom sheet listing every Recipe as a row with its neutral monogram, searchable by name; choosing one sets (and pins) it.
 * B5-LOW: "From the freezer" lists the frozen Leftovers of the Recipes offered (portions and Storage Place).
 * B9-38 (PC-10): the context line names the day, Meal Slot and Course. For a Course other than the main one the groups are
 * "Marked as Dessert", "From the freezer" and "Other Recipes" (each with the info chip "Not marked as Dessert"; picking one marks
 * it for the Course too, `onPickOther`). Search has the focus on open with a fine pointer; on touch the title has it.
 */
export function RecipeChooserSheet({
  open,
  onClose,
  recipes,
  isLoading,
  onPick,
  frozenLeftovers = [],
  onPickLeftover = () => {},
  slot,
  courseId,
  onPickOther,
}: RecipeChooserSheetProps): ReactNode {
  const [query, setQuery] = useState('')
  const course = slot ? sheetCourse(slot, courseId) : undefined
  const main = course?.main ?? true
  const courseName = course?.name ?? ''
  const shown = matchRecipes(recipes, query)
  const groups = course ? chooseGroups(shown, { id: course.courseId, main }) : { marked: shown, other: [] }
  const freezer = freezerChoices(frozenLeftovers, new Set(shown.map((r) => r.id)))
  const fine = useFinePointer()
  const searchRef = useRef<HTMLInputElement>(null)
  const { bodyRef, titleRef } = useSheetTitleFocus<HTMLDivElement>()
  const row = (r: RecipeChoice, other: boolean) => (
    <ListRow
      key={r.id}
      title={r.name}
      meta={r.totalMinutes ? formatMinutes(r.totalMinutes) : undefined}
      leading={<RecipeThumb name={r.name} photoUrl={r.imageUrl} size={48} tone="neutral" />}
      below={
        other ? (
          <div className="plan-sheet__chips">
            <Chip kind="status" status="info">
              {s.notMarkedAs(courseName)}
            </Chip>
          </div>
        ) : undefined
      }
      onActivate={() => (other ? (onPickOther ?? onPick)(r.id) : onPick(r.id))}
    />
  )
  const group = (label: string, children: ReactNode) => (
    <section className="plan-sheet__group" key={label}>
      <p className="plan-sheet__label" aria-hidden="true">
        {label}
      </p>
      <ListGroup label={label}>{children}</ListGroup>
    </section>
  )
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      context={slot ? chooserContext(slot, courseId) : undefined}
      title={s.chooseTitle}
      initialFocusRef={fine ? searchRef : titleRef}
    >
      <div ref={bodyRef} className="plan__stack plan-sheet__rows plan-sheet__chooser">
        {isLoading ? <p className="plan__muted">{s.loading}</p> : null}
        {!isLoading && recipes.length === 0 ? <p className="plan__muted">{s.chooseNone}</p> : null}
        {!isLoading && recipes.length > 0 ? (
          <>
            <div className="plan-sheet__search">
              <SearchField ref={searchRef} label={main ? s.searchRecipes : s.searchCourseRecipes(courseName)} placeholder={main ? s.searchRecipes : s.searchCourseRecipes(courseName)} value={query} onChange={setQuery} />
            </div>
            {main
              ? [
                  freezer.length > 0 ? group(leftoverStrings.fromTheFreezer, freezer.map(freezerRow)) : null,
                  groups.marked.length > 0 ? group(s.recipesList, groups.marked.map((r) => row(r, false))) : null,
                ]
              : [
                  groups.marked.length > 0 ? group(s.markedAs(courseName), groups.marked.map((r) => row(r, false))) : null,
                  freezer.length > 0 ? group(leftoverStrings.fromTheFreezer, freezer.map(freezerRow)) : null,
                  groups.other.length > 0 ? group(s.otherRecipes, groups.other.map((r) => row(r, true))) : null,
                ]}
          </>
        ) : null}
      </div>
    </BottomSheet>
  )

  function freezerRow(c: FreezerChoice) {
    return (
      <ListRow
        key={c.leftoverId}
        title={c.recipeName}
        meta={c.meta}
        leading={<RecipeThumb name={c.recipeName} size={48} tone="neutral" />}
        onActivate={() => onPickLeftover(c.leftoverId)}
      />
    )
  }
}
