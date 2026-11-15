// B9-14 seed (leftover-menu-sheet, DS-01): a Leftover on Today. The first meal the plan lists as to confirm (past, not yet answered) is
// marked Cooked with 2 Leftover portions, so "Leftovers to use" shows it with its ⋮. One meal only: the other to-confirm meals stay
// for the scenarios that need them. A to-confirm entry is one Course of a Meal Slot (courseId on the entry; `courses` is empty).
// Best effort: an API answer other than 2xx is reported by step() and skipped (the scenario's setup then reports "not inspected").
// seed(ctx) reads step, api from ctx; adds nothing.
export const order = 140

export async function seed(ctx) {
  const { step, api } = ctx
  const confirm = (await api('GET', '/api/plan/to-confirm')).json?.slots ?? []
  const first = confirm.find((s) => s.courseId != null)
  if (!first) return
  await step('cook for a leftover', 'POST', `/api/plan/${first.date}/${first.mealSlotId}/${first.courseId}/cooked`, { leftoverPortions: 2 })
}
