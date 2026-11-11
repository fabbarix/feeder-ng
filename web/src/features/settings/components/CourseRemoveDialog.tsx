// The Delete / Archive dialog of a Course: what it is on, the replacement, the Planned Meals and Slot Rules that go.
// A `<dialog>` built on the shared Dialog; the state and the rules are in hooks/useCourseRemoval and lib/courseRemoval.
import { Button, CourseSelect, Dialog } from '../../../ui'
import { coursesStrings } from '../coursesStrings'
import type { CourseRemovalState } from '../hooks/useCourseRemoval'
import { plannedMealLines, replacementLine, slotRuleLines, usageLine } from '../lib/courseRemoval'

const s = coursesStrings.removal

export interface CourseRemoveDialogProps {
  state: CourseRemovalState
  locale?: string
}

export function CourseRemoveDialog({ state, locale = 'en' }: CourseRemoveDialogProps) {
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
      actions={
        <>
          <Button variant="tertiary" data-autofocus disabled={busy} onClick={state.close}>
            {s.cancel}
          </Button>
          <Button variant="danger" disabled={blocked} loading={busy} onClick={() => void state.confirm()}>
            {mode === 'delete' ? s.confirmDelete : s.confirmArchive}
          </Button>
        </>
      }
    >
      {mode === 'archive' ? <p>{s.plannedRefusal(name)}</p> : null}
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
          <h3 className="course-remove__heading">{s.plannedHeading}</h3>
          <ul aria-label={s.plannedHeading} className="course-remove__list">
            {meals.map((m) => (
              <li key={m.key}>
                {m.text}
                {m.pinned ? <span className="course-remove__pinned"> {s.pinned}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {rules.length > 0 ? (
        <section>
          <h3 className="course-remove__heading">{s.rulesHeading}</h3>
          <ul aria-label={s.rulesHeading} className="course-remove__list">
            {rules.map((r) => (
              <li key={r.key}>{r.text}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </Dialog>
  )
}
