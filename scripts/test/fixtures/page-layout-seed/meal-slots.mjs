// B9-42 seed (SET-15, SAFE-02): a removed Meal Slot that keeps Cooked history, so /settings/meal-slots draws its "Removed Meal Slots" tile.
// Creates "Snack" at 16:30 on every weekday, plans it, marks the meals the plan lists as to confirm (past, unanswered) Cooked, then removes
// every Snack (DELETE /api/meal-slots/{id}: a soft removal, 204). Best effort: an answer other than 2xx is ignored here, and the scenario
// `removed-meal-slots` then reports "not inspected" instead of passing on a page without the tile.
// Also leaves a Dinner with two Courses on every day (the household seed's), which `meal-slot-editor` needs for its Course rows.
// seed(ctx) reads api, step, members, attendance from ctx; adds ctx.removedSnackIds.
export const order = 150

export async function seed(ctx) {
  const { step, api } = ctx
  const attendance = ctx.attendance ?? []
  const ids = []
  for (let d = 1; d <= 7; d++) {
    const r = await api('POST', '/api/meal-slots', { weekday: d, name: 'Snack', time: '16:30', attendance })
    if (r.json?.id) ids.push(r.json.id)
  }
  // The plan now lists Snack as a Planned Meal on every day it has a past slot to confirm: cook what it lists so Cooked history exists.
  const confirm = (await api('GET', '/api/plan/to-confirm')).json?.slots ?? []
  for (const s of confirm.filter((x) => ids.includes(x.mealSlotId))) {
    for (const c of s.courses ?? []) await step('cook a Snack', 'POST', `/api/plan/${s.date}/${s.mealSlotId}/${c.courseId}/cooked`, {})
  }
  for (const id of ids) await api('DELETE', `/api/meal-slots/${id}`)
  ctx.removedSnackIds = ids
}
