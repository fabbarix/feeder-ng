// B9-32 (PC-07, PC-14 with amendment A2; batch w4d review): the Plan's start chips and a warn cause, so the guard and the review see
// the rows the seed did not have before:
//   - an overnight start (info chip "Start Fri 21:30"): "Overnight cinnamon buns" (11 h, mostly a passive rise) chosen for the Breakfast
//     of the last day of the week, so its cooking starts the evening before, inside the cooking times (06:30 to 22:00);
//   - a Pinned meal that starts in the quiet hours (warn chip "Start 02:30"): the 6 h slow-cooker stew chosen for the Breakfast of day 4;
//   - an unfilled cause other than Dessert, in the warn tone (too_early, "Outside your cooking times"): on day 5 the Dinner is moved to
//     06:40 for that date and its Main chosen by hand, so no Side or Dessert Recipe can start after 06:30 (the Main keeps its warn chip).
// Best effort like every area: a step the API refuses is reported and skipped. Runs before b9-34 (its ticks follow this plan).
// seed(ctx) reads api, step, line from ctx; adds overnightBreakfastRecipe.

export const order = 332

export async function seed(ctx) {
  const { api, step, line } = ctx
  const listOf = (r) => (Array.isArray(r.json) ? r.json : (Object.values(r.json ?? {}).find(Array.isArray) ?? []))
  const courses = listOf(await api('GET', '/api/courses'))
  const main = courses.find((c) => c.main) ?? courses.find((c) => c.name === 'Main')
  if (!main) return
  const recipes = listOf(await api('GET', '/api/recipes'))
  const byName = (name) => recipes.find((r) => r.name === name)
  const buns = await step('overnight recipe', 'POST', '/api/recipes', {
    name: 'Overnight cinnamon buns', description: '', yield: 4, readyMeal: false, tags: ['vegetarian'], courseIds: [main.id], lines: [line(3, 200)],
    steps: [
      { text: 'Mix the dough and shape the buns.', kind: 'active', durationMinutes: 15, leadTimeMinutes: 0, after: [], uses: [] },
      { text: 'Let them rise slowly overnight.', kind: 'passive', durationMinutes: 630, leadTimeMinutes: 0, after: [0], uses: [] },
      { text: 'Bake.', kind: 'active', durationMinutes: 15, leadTimeMinutes: 0, after: [1], uses: [] },
    ],
  })
  const plan = (await api('GET', '/api/plan')).json
  const slots = plan?.slots ?? []
  const dates = [...new Set(slots.map((s) => s.date))].sort()
  const slotOn = (i, name) => slots.find((s) => s.date === dates[i] && s.name === name)
  const choose = (s, courseId, recipeId, what) =>
    s && recipeId ? step(what, 'PUT', `/api/plan/${s.date}/${s.mealSlotId}/${courseId}`, { recipeId }) : null
  // The info chip: the last day's Breakfast starts the evening before.
  const lastBreakfast = slotOn(dates.length - 1, 'Breakfast')
  await choose(lastBreakfast, main.id, buns.json?.id, 'overnight start')
  // The warn chip: a Pinned meal whose start is in the quiet hours.
  await choose(slotOn(4, 'Breakfast'), main.id, byName('Slow cooker beef and barley stew')?.id, 'start in the quiet hours')
  // The warn cause: day 5's Dinner at 06:40, its Main chosen by hand (no Ready Meal takes the whole meal), Side and Dessert unfilled.
  const early = slotOn(5, 'Dinner')
  if (early) {
    await step('early dinner', 'PATCH', `/api/meal-slots/${early.mealSlotId}/dates/${early.date}`, { time: '06:40' })
    await choose(early, main.id, byName('Spinach omelette')?.id, 'early dinner main')
  }
  Object.assign(ctx, { overnightBreakfastRecipe: buns.json?.id ?? null })
}
