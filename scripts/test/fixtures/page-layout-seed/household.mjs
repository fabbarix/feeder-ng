// The page-layout seed, household area (B9-03: scripts/test/fixtures/page-layout-seed.mjs split by area; the calls are unchanged).
// The Household: four Members (one with a very long name) and Breakfast, Lunch and Dinner every day.
// seed(ctx) reads api, step from ctx and adds members, attendance, SLOT_NAME.
import { SLOT_TIMES } from '../page-layout-seed-zones.mjs'

export async function seed(ctx) {
  const { api, step } = ctx
  // Members (one very long name: F-ids in the review)
  for (const [name, colour, f] of [['Anna', '#e07a5f', 1], ['Ben', '#3d405b', 1], ['Chiara', '#81b29a', 0.75], ['Lucia Maria Bernadette', '#f2cc8f', 0.5]]) {
    await step('member', 'POST', '/api/members', { name, colour, avatar: '', portionFactor: f })
  }
  const members = (await api('GET', '/api/members')).json ?? []
  const attendance = members.slice(0, 3).map((m) => ({ memberId: m.id, portionFactorOverride: null }))

  // Meal Slots: Breakfast, Lunch and Dinner every day (round 3: at any hour at least two of them are To confirm, see
  // page-layout-seed-zones.mjs)
  const SLOT_NAME = { '08:30': 'Breakfast', '13:00': 'Lunch', '19:00': 'Dinner' }
  for (let d = 1; d <= 7; d++) {
    for (const time of SLOT_TIMES) await step('slot', 'POST', '/api/meal-slots', { weekday: d, name: SLOT_NAME[time], time, attendance })
  }
  Object.assign(ctx, { members, attendance, SLOT_NAME })
}
