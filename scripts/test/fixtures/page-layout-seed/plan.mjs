// The page-layout seed, plan area (B9-03: scripts/test/fixtures/page-layout-seed.mjs split by area; the calls are unchanged).
// Long realistic names, the Side Course, Dinner with Main and Side, Planned Meals not marked Cooked yet (time zones), Leftovers,
// favourites and a Slot Rule.
// seed(ctx) reads api, step, ingredientId, line, LONG_TAG, members, SLOT_NAME from ctx and adds sideCourse, longTagRecipe, toConfirm.
import { pickZones } from '../page-layout-seed-zones.mjs'

export async function seed(ctx) {
  const { api, step, ingredientId, line, LONG_TAG, members, SLOT_NAME } = ctx
  // DS-A (ADR 0016): realistic long names, a Side Course and Planned Meals not marked Cooked yet, so the guard sees what an iPad
  // showed in beta.5 ("Cauliflo/wer", "cau-/liflower with pep-/pers", the "Includes Thu Dinner, not marked Cooked yet" hint).
  const LONG = [['Cauliflower', 'g'], ['Gorgonzola', 'g'], ['Chestnut mushrooms', 'g'], ['Cucumber', 'piece'], ['Red pepper', 'piece'], ['Feta', 'g'], ['Marjoram', 'g']]
  const longIng = {}
  for (const [name, unit] of LONG) {
    const r = await step('ingredient', 'POST', '/api/ingredients', { name, baseUnit: unit, shelfLifeDays: 5, conversions: [] })
    if (r.ok && r.json) longIng[name] = r.json
  }
  const lineOf = (name, q) => ({ ingredientId: longIng[name]?.id ?? ingredientId, quantity: q, unit: longIng[name]?.baseUnit ?? 'g', optional: false, note: '' })
  const listOf = (r) => (Array.isArray(r.json) ? r.json : (Object.values(r.json ?? {}).find(Array.isArray) ?? []))
  await api('POST', '/api/courses', { name: 'Side' }) // a default Course on a fresh Household (409 then)
  const courses = listOf(await api('GET', '/api/courses'))
  const mainCourse = courses.find((c) => c.main) ?? courses.find((c) => c.name === 'Main')
  const sideCourse = courses.find((c) => c.name === 'Side')
  const cook = [{ text: 'Prepare and cook.', kind: 'active', durationMinutes: 15, leadTimeMinutes: 0, after: [], uses: [] }]
  const sideIds = []
  let longTagRecipe = null
  for (const [name, lines] of [
    ['Two-colour cauliflower with peppers', [lineOf('Cauliflower', 1500), lineOf('Red pepper', 2), lineOf('Marjoram', 2)]],
    ['Cucumber tomato feta salad', [lineOf('Cucumber', 2), lineOf('Feta', 150), line(3, 200)]],
  ]) {
    // hf-recipes-filter round 2: the salad carries LONG_TAG, so /recipes?course=<Side>&tag=<LONG_TAG> lists it (guard SCENARIOS).
    const tags = name.startsWith('Cucumber') ? ['vegetarian', LONG_TAG] : ['vegetarian']
    const r = await step('side recipe', 'POST', '/api/recipes', { name, description: '', yield: 4, readyMeal: false, tags, courseIds: sideCourse ? [sideCourse.id] : undefined, lines, steps: cook })
    if (r.ok && r.json?.id) sideIds.push(r.json.id)
    if (r.ok && r.json?.id && tags.includes(LONG_TAG)) longTagRecipe = r.json.id
  }
  const mainR = await step('main recipe', 'POST', '/api/recipes', {
    name: 'Cauliflower al gorgonzola with chestnut mushrooms', description: '', yield: 4, readyMeal: false, tags: ['vegetarian'],
    lines: [lineOf('Cauliflower', 1000), lineOf('Gorgonzola', 250), lineOf('Chestnut mushrooms', 300)], steps: cook,
  })
  // Dinner serves Main and Side (a Meal Slot PATCH takes the whole slot)
  if (mainCourse && sideCourse) {
    for (const slot of listOf(await api('GET', '/api/meal-slots')).filter((x) => x.name === 'Dinner')) {
      const { id, ...body } = slot
      await step('dinner courses', 'PATCH', `/api/meal-slots/${id}`, { ...body, courses: [mainCourse, sideCourse].map((c) => ({ id: c.id, optional: false, optOutMemberIds: [] })) })
    }
  }
  // Planned Meals not marked Cooked yet (the "to-confirm" list): there is no clock to move, so the Household's time zone is moved
  // instead. pickZones (page-layout-seed-zones.mjs) gives a plan zone (UTC-12) where the slot instances are still ahead, and a
  // confirm zone (UTC+14) where they are more than 2 h 15 min past. Those instances are planned while the zone is the plan zone.
  const setZone = async (timeZone) => {
    const cur = (await api('GET', '/api/household/settings')).json
    if (!cur) return
    const { timeZoneConfigured, ...rest } = cur
    await step('time zone', 'PUT', '/api/household/settings', { ...rest, timeZone })
  }
  const zones = pickZones(Date.now())
  await setZone(zones.planZone)
  await step('plan', 'POST', '/api/plan/regenerate', {})
  const planned = (await api('GET', '/api/plan')).json?.slots ?? []
  for (const t of zones.targets) {
    for (const s of planned.filter((x) => x.name === SLOT_NAME[t.time] && x.date === t.date)) {
      for (const c of s.courses ?? []) {
        const rid = c.courseId === sideCourse?.id ? sideIds[0] : mainR.json?.id
        if (rid) await api('PUT', `/api/plan/${s.date}/${s.mealSlotId}/${c.courseId}`, { recipeId: rid }) // a past slot refuses: expected
      }
    }
  }
  // DS-A: the Plan chip line (system.md §6). A long-named Side with a big Yield (so its Leftovers are planned: "Leftover for …" on
  // the day it is cooked, "Leftover from …" where it is served), two Members' favourite on a planned Recipe ("Anna and Ben's
  // favourite") and a Slot Rule ("Slot Rule: Monday"), so the guard stresses one-line chips on /plan and / at 834 and 1024.
  const longSide = await step('long side', 'POST', '/api/recipes', {
    name: 'Roasted two-colour cauliflower with sweet peppers, capers and marjoram', description: '', yield: 10, readyMeal: false, tags: ['vegetarian'],
    courseIds: sideCourse ? [sideCourse.id] : undefined, lines: [lineOf('Cauliflower', 2000), lineOf('Red pepper', 3), lineOf('Marjoram', 3)], steps: cook,
  })
  if (longSide.ok && longSide.json?.id) sideIds.unshift(longSide.json.id)
  const favId = mainR.json?.id
  if (favId) for (const m of members.slice(0, 2)) await step('favourite', 'PUT', `/api/recipes/${favId}/preference`, { state: 'favourite', memberId: m.id })
  const mondayDinner = listOf(await api('GET', '/api/meal-slots')).find((x) => x.name === 'Dinner' && x.weekday === 1)
  if (mondayDinner && mainCourse && favId) await step('slot rule', 'POST', '/api/slot-rules', { mealSlotId: mondayDinner.id, courseId: mainCourse.id, recipeId: favId })
  await setZone(zones.confirmZone)
  await step('plan', 'POST', '/api/plan/regenerate', {})
  // Tomorrow's Dinner Side: the long Side, two Batches, so it leaves Leftovers for a later Dinner; the regenerate then plans them.
  const ahead = ((await api('GET', '/api/plan')).json?.slots ?? []).filter((x) => x.name === 'Dinner' && x.date > (new Date(Date.now() + 14 * 3600e3).toISOString().slice(0, 10)))
  const tomorrowDinner = ahead[0]
  if (tomorrowDinner && sideCourse && longSide.json?.id) {
    await step('side batches', 'PUT', `/api/plan/${tomorrowDinner.date}/${tomorrowDinner.mealSlotId}/${sideCourse.id}`, { recipeId: longSide.json.id, batches: 2 })
    await step('plan', 'POST', '/api/plan/regenerate', {})
  }
  const toConfirm = ((await api('GET', '/api/plan/to-confirm')).json?.slots ?? []).length
  Object.assign(ctx, { sideCourse, longTagRecipe, toConfirm })
}
