// B9-44 (TB-02, `today-advance`): an Advance Step due in the next 24 hours. A Recipe whose first step is an Advance Step with a 24 h lead is planned on
// tomorrow's Dinner (19:00), so the Step falls due at 19:00 today and Today's Advance Steps tile lists it ("Today 19:00", or "Overdue" once that hour
// has gone). Best effort like the base areas: a step the API refuses is reported and skipped.
// seed(ctx) reads api, step, line from ctx; adds advanceRecipe.
export const order = 150

export async function seed(ctx) {
  const { api, step, line } = ctx
  const steps = [
    { text: 'Take the beef out of the freezer to thaw.', kind: 'advance', durationMinutes: 0, leadTimeMinutes: 24 * 60, after: [], uses: [] },
    { text: 'Braise the beef with the barley until tender.', kind: 'active', durationMinutes: 40, leadTimeMinutes: 0, after: [0], uses: [] },
  ]
  const r = await step('advance recipe', 'POST', '/api/recipes', { name: 'Slow cooker beef and barley stew', description: '', yield: 4, readyMeal: false, tags: [], lines: [line(3, 400)], steps })
  const recipeId = r.json?.id
  if (!recipeId) return
  const view = (await api('GET', '/api/plan')).json
  const tomorrow = view?.today ? new Date(Date.parse(`${view.today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : null
  const dinner = (view?.slots ?? []).find((s) => s.date === tomorrow && s.name === 'Dinner')
  const main = dinner?.courses?.find((c) => c.main) ?? dinner?.courses?.[0]
  if (!dinner || !main) {
    console.warn("today-advance seed: no Dinner tomorrow to plan the Advance Step on")
    return
  }
  await step('advance dinner', 'PUT', `/api/plan/${dinner.date}/${dinner.mealSlotId}/${main.courseId}`, { recipeId })
  const rows = (await api('GET', '/api/today/advance-steps')).json?.steps ?? []
  if (!rows.some((s) => s.recipeName === 'Slow cooker beef and barley stew')) console.warn('today-advance seed: GET /api/today/advance-steps does not list the Step')
  Object.assign(ctx, { advanceRecipe: recipeId })
}
