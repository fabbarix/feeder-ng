// B9-47 (TB-04, TB-07): the Kitchen board's Next Advance Step, so the board scenarios (scenarios/b9-47.mjs) see its Done, the
// board's control besides Cook and Close. A Recipe with an Advance Step (soak the chickpeas 12 h ahead) is Pinned to the Dinner two
// days from today, so the step is due tomorrow evening: the board shows it with "Start in ..." and Done. Best effort like the base
// areas: a step the API refuses is reported and skipped.
// seed(ctx) reads api, step, line from ctx; adds boardAdvanceRecipe.
export const order = 350

export async function seed(ctx) {
  const { api, step, line } = ctx
  const steps = [
    { text: 'Soak the chickpeas in plenty of cold water', kind: 'advance', durationMinutes: 5, leadTimeMinutes: 720, after: [], uses: [] },
    { text: 'Simmer the chickpeas with the spinach and the spices until thick.', kind: 'active', durationMinutes: 40, leadTimeMinutes: 0, after: [], uses: [] },
  ]
  const r = await step('board advance recipe', 'POST', '/api/recipes', {
    name: 'Chickpea and spinach curry', description: '', yield: 4, readyMeal: false, tags: [], lines: [line(3, 300)], steps,
  })
  const recipeId = r.json?.id
  if (!recipeId) return
  const view = (await api('GET', '/api/plan')).json
  const day = view?.today ? new Date(Date.parse(`${view.today}T12:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10) : null
  const dinner = (view?.slots ?? []).find((s) => s.date === day && s.name === 'Dinner')
  const main = dinner?.courses?.find((c) => c.main) ?? dinner?.courses?.[0]
  if (!dinner || !main) return
  await step('board advance dinner', 'PUT', `/api/plan/${dinner.date}/${dinner.mealSlotId}/${main.courseId}`, { recipeId })
  const board = (await api('GET', '/api/board')).json
  if (!board?.nextAdvance) console.warn('board seed: the board has no Next Advance Step')
  Object.assign(ctx, { boardAdvanceRecipe: recipeId })
}
