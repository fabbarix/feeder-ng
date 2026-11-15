// B9-53 (TB-06): test fixtures for the first-run checklist's facts. Not product code: only the tests import this.
import type { SetupFacts } from '../features/today/lib/setup'

/** A brand new Household as GET /api/household/settings and the lists report it: the default zone and currency, not yet confirmed. */
export const FRESH: SetupFacts = {
  members: 0,
  mealSlots: 0,
  mealSlotsWithAttendance: 0,
  recipes: 0,
  plannedMeals: 0,
  unplannedMeals: 0,
  timeZoneConfigured: false,
  setupHidden: false,
  timeZone: 'UTC',
  currency: 'USD',
  memberNames: [],
  mealSlotNames: [],
  mealSlotsEveryDay: false,
  everyoneAttends: false,
}

export const facts = (over: Partial<SetupFacts> = {}): SetupFacts => ({ ...FRESH, ...over })

/** Steps 1 to 3 done, nothing else: the Household of the mock of step 4. */
export const THREE_DONE: SetupFacts = facts({
  timeZoneConfigured: true,
  timeZone: 'Europe/Rome',
  currency: 'EUR',
  members: 3,
  memberNames: ['Anna', 'Ben', 'Chiara'],
  mealSlots: 21,
  mealSlotsWithAttendance: 21,
  mealSlotNames: ['Breakfast', 'Lunch', 'Dinner'],
  mealSlotsEveryDay: true,
  everyoneAttends: true,
})

/** Everything set up: five Recipes and a plan. */
export const ESTABLISHED: SetupFacts = { ...THREE_DONE, recipes: 5, plannedMeals: 14 }

/** GET /api/household/settings as the server sends it (beta.9: setupHidden, earliestStart). */
export const settings = (over: Record<string, unknown> = {}) => ({
  timeZone: 'UTC',
  timeZoneConfigured: false,
  currency: 'USD',
  planningHorizonDays: 7,
  defaultCooldownDays: 7,
  defaultLeftoverUseByDays: 3,
  quietHours: { start: '22:00', end: '07:00' },
  plannerStyle: 0.5,
  location: null,
  earliestStart: '06:30',
  setupHidden: false,
  ...over,
})
