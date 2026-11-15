// B9-42 seed (SET-15, SAFE-02): a removed Meal Slot that keeps Cooked history, so /settings/meal-slots draws its "Removed Meal Slots" tile.
// Creates "Snack" on every weekday, plans today's Snack with the seed's Recipe (a Swap, PUT /api/plan/{today}/{slot}/{main}) and marks
// it Cooked (POST …/cooked: today's meal may be marked at any hour; only a later date is a future_meal), then removes every Snack
// (DELETE /api/meal-slots/{id}: a soft removal, 204). Everything goes through the API; nothing touches the database.
// Snack is at 23:45 so today's run is still ahead in the household's zone when the Swap is made (a past run refuses a Swap).
// A refused step is reported by `step`; the scenario `removed-meal-slots` then fails on a page without the tile instead of passing.
// seed(ctx) reads api, step, attendance, recipeId from ctx; adds ctx.removedSnackIds.
export const order = 150

const TIME = '23:45'

/** YYYY-MM-DD and the ISO weekday of today in the household's time zone. */
function householdToday(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const [y, m, d] = parts.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return { date: parts, weekday: dow === 0 ? 7 : dow }
}

const listOf = (r) => (Array.isArray(r.json) ? r.json : (Object.values(r.json ?? {}).find(Array.isArray) ?? []))

export async function seed(ctx) {
  const { step, api } = ctx
  const attendance = ctx.attendance ?? []
  const byDay = new Map()
  for (let d = 1; d <= 7; d++) {
    const r = await step('Snack slot', 'POST', '/api/meal-slots', { weekday: d, name: 'Snack', time: TIME, attendance })
    if (r.json?.id) byDay.set(d, r.json.id)
  }
  const me = (await api('GET', '/api/me')).json
  const today = householdToday(me?.householdTimeZone)
  const slotId = byDay.get(today.weekday)
  const main = listOf(await api('GET', '/api/courses')).find((c) => c.main)
  if (slotId && main && ctx.recipeId) {
    const base = `/api/plan/${today.date}/${slotId}/${main.id}`
    await step('plan today\'s Snack', 'PUT', base, { recipeId: ctx.recipeId })
    await step('cook today\'s Snack', 'POST', `${base}/cooked`, {})
  } else {
    console.error(`page-layout-seed: meal-slots: no Snack today (${today.date}), no main Course or no Recipe, so no Cooked history`)
  }
  const ids = [...byDay.values()]
  for (const id of ids) await step('remove Snack', 'DELETE', `/api/meal-slots/${id}`)
  ctx.removedSnackIds = ids
}
