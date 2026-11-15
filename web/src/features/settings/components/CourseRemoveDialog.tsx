// The Delete / Archive dialog of a Course: what it is on, the replacement, the Planned Meals and Slot Rules that go.
// A danger ConfirmDialog (SAFE R1: Cancel focused, outline Cancel, rows, no Close); the state and the rules are in
// hooks/useCourseRemoval and lib/courseRemoval.
import { ConfirmDialog, CourseSelect, type ConfirmGroup } from '../../../ui'
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
  // R-E: rows, not bullet sentences: the Recipe, Pinned at the row's end, the Meal Slot and date muted under it.
  const groups: ConfirmGroup[] = [
    { label: s.plannedHeading, rows: meals.map((m) => ({ key: m.recipe, state: m.pinned ? s.pinned : undefined, detail: m.when })) },
    { label: s.rulesHeading, rows: rules.map((r) => ({ key: r.text })) },
  ]

  return (
    <ConfirmDialog
      open
      tone="danger"
      title={mode === 'delete' ? s.deleteTitle(name) : s.archiveTitle(name)}
      body={impact ? usageLine(name, impact) : undefined}
      groups={groups}
      cancelLabel={s.cancel}
      confirmLabel={mode === 'delete' ? s.confirmDelete : s.confirmArchive}
      confirmDisabled={loading || loadFailed || impact === undefined}
      busy={busy}
      onCancel={state.close}
      onConfirm={() => void state.confirm()}
    >
      {mode === 'archive' ? <p role="status">{s.plannedRefusal(name)}</p> : null}
      {loading ? <p role="status">{s.checking(name)}</p> : null}
      {loadFailed ? <p role="alert">{s.loadFailed}</p> : null}
      {impact && needsReplacement ? (
        <>
          <CourseSelect label={s.replacementLabel} courses={choices} value={replacementId} onChange={state.setReplacementId} disabled={busy} />
          {replacementText ? <p>{replacementText}</p> : null}
        </>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </ConfirmDialog>
  )
}
