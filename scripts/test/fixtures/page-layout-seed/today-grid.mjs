// B9-44 (TB-02, TB-09, TB-11, SAFE-09 on Today): Today with every tile the package draws, so the guard and the visual pass see them on a
// real screen. Runs after the base areas, today-hero (140) and today-advance and meal-slots (150), in the Household's To confirm zone.
//   - a second Advance Step, overdue: a 96 h lead on the Dinner the day after tomorrow (its Planned Meal is still ahead), so the tile
//     has two rows, one "Overdue" (TB-02);
//   - Leftovers, one merged row: the advance Recipe cooked twice today in two Meal Slots made for it ("Supper" 23:50 and "Late snack"
//     23:55), 1.25 portions each, so they share a Use-by and show as ONE row "Use by … · 2.5 portions" (B9-45, PC-13);
//   - Leftovers, one question: a Recipe whose Leftovers keep 0 days, cooked in a "Supper" made for the day before (planned while the
//     Household is in the plan zone, UTC-12, where that day is today), so its Use-by has passed and Today asks about it;
//   - the made Meal Slots are removed at the end (a soft removal, as meal-slots.mjs does): the Plan keeps its three slots a day;
//   - Use soon: a second Ingredient good until the day after tomorrow; Throw out or keep?: one spoiled Lot (its Good until moved back).
// The Scan session lives on the phone (IndexedDB), not on the server: the scenario today-shopping makes it with a typed Scan.
// Best effort like the base areas: a refused step is reported by `step` and skipped.
// seed(ctx) reads api, step, line, ing, attendance, advanceRecipe from ctx; adds todayGrid.
export const order = 160

const PLAN_ZONE = 'Etc/GMT+12'
const DAY = 86_400_000
const listOf = (r) => (Array.isArray(r.json) ? r.json : (Object.values(r.json ?? {}).find(Array.isArray) ?? []))
const addDays = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10)

/** YYYY-MM-DD and ISO weekday in a zone, now. */
function dayIn(timeZone) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay()
  return { date, weekday: dow === 0 ? 7 : dow }
}

export async function seed(ctx) {
  const { api, step, line } = ctx
  const attendance = ctx.attendance ?? []
  const settings = async () => (await api('GET', '/api/household/settings')).json
  const setZone = async (timeZone) => {
    const cur = await settings()
    if (!cur) return
    const { timeZoneConfigured, ...rest } = cur
    await step('time zone', 'PUT', '/api/household/settings', { ...rest, timeZone })
  }
  const confirmZone = (await settings())?.timeZone
  const main = listOf(await api('GET', '/api/courses')).find((c) => c.main)
  const made = []
  const out = { overdueStep: false, merged: false, question: false, useSoon: false, spoiled: false }

  // ---- the overdue Advance Step ----
  const soak = await step('overdue advance recipe', 'POST', '/api/recipes', {
    name: 'Chickpea and chard stew with smoked paprika', description: '', yield: 4, readyMeal: false, tags: [], lines: [line(3, 300)],
    steps: [
      { text: 'Soak the chickpeas in plenty of cold water.', kind: 'advance', durationMinutes: 0, leadTimeMinutes: 96 * 60, after: [], uses: [] },
      { text: 'Simmer the chickpeas with the chard and paprika.', kind: 'active', durationMinutes: 45, leadTimeMinutes: 0, after: [], uses: [] },
    ],
  })
  const view = (await api('GET', '/api/plan')).json
  const today = view?.today
  if (soak.json?.id && today) {
    const dinner = (view.slots ?? []).find((s) => s.date === addDays(today, 2) && s.name === 'Dinner')
    const c = dinner?.courses?.find((x) => x.main) ?? dinner?.courses?.[0]
    if (dinner && c) {
      await step('overdue advance dinner', 'PUT', `/api/plan/${dinner.date}/${dinner.mealSlotId}/${c.courseId}`, { recipeId: soak.json.id })
      const rows = (await api('GET', '/api/today/advance-steps')).json?.steps ?? []
      out.overdueStep = rows.some((s) => s.overdue)
    }
  }

  // ---- Leftovers ----
  const cookIn = async (name, time, date, weekday, recipeId, portions) => {
    const slot = await step(`${name} slot`, 'POST', '/api/meal-slots', { weekday, name, time, attendance })
    if (!slot.json?.id || !main) return false
    made.push(slot.json.id)
    const base = `/api/plan/${date}/${slot.json.id}/${main.id}`
    if (!(await step(`plan ${name}`, 'PUT', base, { recipeId })).ok) return false
    return (await step(`cook ${name}`, 'POST', `${base}/cooked`, { leftoverPortions: portions })).ok
  }
  if (main && ctx.advanceRecipe && confirmZone) {
    const t = dayIn(confirmZone)
    const a = await cookIn('Supper', '23:50', t.date, t.weekday, ctx.advanceRecipe, 1.25)
    const b = a && (await cookIn('Late snack', '23:55', t.date, t.weekday, ctx.advanceRecipe, 1.25))
    out.merged = Boolean(a && b)
  }
  const quick = await step('question recipe', 'POST', '/api/recipes', {
    name: 'Sweet potato and black bean chilli', description: '', yield: 4, readyMeal: false, tags: [], lines: [line(3, 200)], leftoverUseByDays: 0,
    steps: [{ text: 'Simmer everything for 40 minutes.', kind: 'active', durationMinutes: 40, leadTimeMinutes: 0, after: [], uses: [] }],
  })
  if (main && quick.json?.id && confirmZone) {
    await setZone(PLAN_ZONE)
    const p = dayIn(PLAN_ZONE)
    out.question = await cookIn('Supper', '23:50', p.date, p.weekday, quick.json.id, 1.5)
    await setZone(confirmZone)
  }
  if (made.length) await step('remove the made Meal Slots', 'POST', '/api/meal-slots/remove', { ids: made })

  // ---- Use soon and Throw out or keep? ----
  const ing = ctx.ing ?? []
  const lotWith = async (what, item, goesOff, uuid) => {
    if (!item || !today) return false
    const r = await step(what, 'POST', '/api/stock/lots', { ingredientId: item.id, quantity: 200, purchased: addDays(today, -3), source: 'manual', clientUuid: uuid })
    const id = r.json?.id ?? r.json?.lot?.id
    if (!id) return false
    return (await step(`${what} good until`, 'PATCH', `/api/stock/lots/${id}`, { goesOff })).ok
  }
  out.useSoon = await lotWith('use-soon lot 2', ing[1], today ? addDays(today, 2) : null, 'layout-seed-today-use-soon')
  out.spoiled = await lotWith('spoiled lot', ing[2], today ? addDays(today, -2) : null, 'layout-seed-today-spoiled')

  const left = (await api('GET', '/api/plan/leftovers')).json?.leftovers ?? []
  if (!out.question || !left.some((l) => l.useBy < today)) console.warn('today-grid seed: no Leftover past its Use-by (the question)')
  if (!out.overdueStep) console.warn('today-grid seed: no overdue Advance Step')
  ctx.todayGrid = out
}
