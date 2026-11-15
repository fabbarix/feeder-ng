// B9-39 (A2 on Today, decision PC 5 as amended): an overnight start. A Recipe that takes 15 h 30 min is Pinned to tomorrow's Lunch
// (13:00), so its cooking starts at 21:30 the evening before: inside the cooking times (Earliest start 06:30, Latest start 22:00, the
// defaults), so the meal carries `startsAt` and the info chip "Start <weekday> 21:30" on Plan and on Today's hero. Best effort like
// the base areas: a step the API refuses is reported and skipped.
// seed(ctx) reads api, step, line from ctx; adds overnightRecipe.
export const order = 140

export async function seed(ctx) {
  const { api, step, line } = ctx
  const listOf = (r) => (Array.isArray(r.json) ? r.json : (Object.values(r.json ?? {}).find(Array.isArray) ?? []))
  // Latest start on (22:00), whatever an earlier area left
  const cur = (await api('GET', '/api/household/settings')).json
  if (cur && cur.latestStart == null) {
    const { timeZoneConfigured, ...rest } = cur
    await step('latest start', 'PUT', '/api/household/settings', { ...rest, latestStart: '22:00' })
  }
  const steps = [
    { text: 'Brown the pork shoulder all over and put it in the slow cooker with the tomatoes.', kind: 'active', durationMinutes: 30, leadTimeMinutes: 0, after: [], uses: [] },
    { text: 'Slow cook on low overnight until it falls apart.', kind: 'passive', durationMinutes: 900, leadTimeMinutes: 0, after: [0], uses: [] },
  ]
  const r = await step('overnight recipe', 'POST', '/api/recipes', {
    name: 'Overnight slow-cooked pork shoulder ragù', description: '', yield: 6, readyMeal: false, tags: [], lines: [line(3, 400)], steps,
  })
  const recipeId = r.json?.id
  if (!recipeId) return
  const view = (await api('GET', '/api/plan')).json
  const tomorrow = view?.today ? new Date(Date.parse(`${view.today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : null
  const lunch = (view?.slots ?? []).find((s) => s.date === tomorrow && s.name === 'Lunch')
  const main = lunch?.courses?.find((c) => c.main) ?? lunch?.courses?.[0]
  if (!lunch || !main) return
  await step('overnight lunch', 'PUT', `/api/plan/${lunch.date}/${lunch.mealSlotId}/${main.courseId}`, { recipeId })
  const after = (await api('GET', '/api/plan')).json?.slots?.find((s) => s.date === lunch.date && s.mealSlotId === lunch.mealSlotId)
  const meal = after?.courses?.find((c) => c.courseId === main.courseId)?.meal
  if (!meal?.startsAt) console.warn(`today-hero seed: tomorrow's Lunch has no startsAt (startBy ${meal?.startBy ?? '-'}, earlyStart ${meal?.earlyStart ?? '-'})`)
  Object.assign(ctx, { overnightRecipe: recipeId })
}
