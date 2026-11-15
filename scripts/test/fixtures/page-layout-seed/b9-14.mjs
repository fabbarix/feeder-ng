// B9-14 seed (leftover-menu-sheet, DS-01): a Leftover on Today. Cooks a planned Course that leaves portions over: every meal the plan
// lists as to confirm (past, not yet answered) is marked Cooked, so the Leftovers it leaves show in "Leftovers to use". Best effort: an
// API answer other than 2xx is ignored here (the scenario's setup then reports it as not inspected).
// seed(ctx) reads step, api from ctx; adds nothing.
export const order = 140

export async function seed(ctx) {
  const { step, api } = ctx
  const confirm = (await api('GET', '/api/plan/to-confirm')).json?.slots ?? []
  for (const s of confirm.slice(0, 2)) {
    for (const c of s.courses ?? []) {
      await step('cook for a leftover', 'POST', `/api/plan/${s.date}/${s.mealSlotId}/${c.courseId}/cooked`, {})
    }
  }
}
