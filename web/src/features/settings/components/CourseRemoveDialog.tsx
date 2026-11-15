// The Delete / Archive dialog of a Course: what it is on, the replacement, the Planned Meals and Slot Rules that go.
// A `<dialog>` built on the shared Dialog; the state and the rules are in hooks/useCourseRemoval and lib/courseRemoval.
import { useId } from 'react'
import { Button, CourseSelect, DetailList, DetailRow, Dialog } from '../../../ui'
import { coursesStrings } from '../coursesStrings'
import type { CourseRemovalState } from '../hooks/useCourseRemoval'
import { plannedMealLines, replacementLine, slotRuleLines, usageLine } from '../lib/courseRemoval'

const s = coursesStrings.removal

export interface CourseRemoveDialogProps {
  state: CourseRemovalState
  locale?: string
}

export function CourseRemoveDialog({ state, locale = 'en' }: CourseRemoveDialogProps) {
  const mealsId = useId()
  const rulesId = useId()
  const { course, mode, impact, loading, loadFailed, choices, replacementId, needsReplacement, busy, error } = state
  if (course === null) return null
  const name = course.name
  const replacementName = choices.find((c) => c.id === replacementId)?.name ?? ''
  const replacementText = impact && needsReplacement ? replacementLine(name, impact, replacementName) : null
  const meals = impact ? plannedMealLines(impact.plannedMeals, locale) : []
  const rules = impact ? slotRuleLines(impact.slotRules) : []
  const blocked = busy || loading || loadFailed || impact === undefined

  return (
    <Dialog
      open
      onClose={state.close}
      title={mode === 'delete' ? s.deleteTitle(name) : s.archiveTitle(name)}
      tone="danger"
      onCancel={state.close}
      cancelLabel={s.cancel}
      cancelProps={{ 'data-autofocus': true, disabled: busy }}
      actions={
        <Button variant="danger" disabled={blocked} loading={busy} onClick={() => void state.confirm()}>
          {mode === 'delete' ? s.confirmDelete : s.confirmArchive}
        </Button>
      }
    >
      {mode === 'archive' ? <p role="status">{s.plannedRefusal(name)}</p> : null}
      {loading ? <p role="status">{s.checking(name)}</p> : null}
      {loadFailed ? <p role="alert">{s.loadFailed}</p> : null}
      {impact ? <p>{usageLine(name, impact)}</p> : null}
      {impact && needsReplacement ? (
        <>
          <CourseSelect label={s.replacementLabel} courses={choices} value={replacementId} onChange={state.setReplacementId} disabled={busy} />
          {replacementText ? <p>{replacementText}</p> : null}
        </>
      ) : null}
      {meals.length > 0 ? (
        <section>
          <h3 id={mealsId} className="course-remove__heading">
            {s.plannedHeading}
          </h3>
          {/* R-E: rows, not bullet sentences: the Recipe, Pinned at the row's end, the Meal Slot and date muted under it. */}
          <DetailList aria-labelledby={mealsId}>
            {meals.map((m) => (
              <DetailRow key={m.key} label={m.recipe} state={m.pinned ? s.pinned : undefined} detail={m.when} />
            ))}
          </DetailList>
        </section>
      ) : null}
      {rules.length > 0 ? (
        <section>
          <h3 id={rulesId} className="course-remove__heading">
            {s.rulesHeading}
          </h3>
          <DetailList aria-labelledby={rulesId}>
            {rules.map((r) => (
              <DetailRow key={r.key} label={r.text} />
            ))}
          </DetailList>
        </section>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </Dialog>
  )
}
