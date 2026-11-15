// The one place Today reads the Members, Meal Slots, Recipes, the plan and (B9-53) the Household settings for the first-run checklist:
// counts, the confirmed time zone and currency, setupHidden, and the names the done steps summarise. No domain rule lives here.
import { useQuery } from '@tanstack/react-query'
import { http } from '../../lib/http'
import { mealSlotFacts, type MealSlotLike, planFacts, type PlanSlotLike, type SetupFacts } from './lib/setup'

interface MemberView {
  id?: number
  name?: string
}
type SlotView = MealSlotLike
interface PlanView {
  slots?: PlanSlotLike[]
}
interface SettingsView {
  timeZone: string
  timeZoneConfigured: boolean
  currency: string
  /** beta.9; an older server leaves it out (not hidden). */
  setupHidden?: boolean
}

/** The query keys the setup facts read. The settings share the Settings feature's key, so a save on either side updates both. */
export const setupKeys = {
  members: ['members', 'setup'] as const,
  mealSlots: ['meal-slots', 'setup'] as const,
  recipes: ['recipes', 'setup'] as const,
  plan: ['plan', 'setup'] as const,
  settings: ['household', 'settings'] as const,
}

const qs = {
  members: { queryKey: setupKeys.members, queryFn: () => http.get<MemberView[]>('/api/members') },
  mealSlots: { queryKey: setupKeys.mealSlots, queryFn: () => http.get<SlotView[]>('/api/meal-slots') },
  recipes: { queryKey: setupKeys.recipes, queryFn: () => http.get<unknown[]>('/api/recipes') },
  plan: { queryKey: setupKeys.plan, queryFn: () => http.get<PlanView>('/api/plan') },
  settings: { queryKey: setupKeys.settings, queryFn: () => http.get<SettingsView>('/api/household/settings') },
}

/** Facts for the setup checklist. `facts` is null while loading and when any request fails (never a false first run). */
export function useSetupFacts(): { facts: SetupFacts | null; loading: boolean } {
  const members = useQuery({ ...qs.members, retry: false })
  const mealSlots = useQuery({ ...qs.mealSlots, retry: false })
  const recipes = useQuery({ ...qs.recipes, retry: false })
  const plan = useQuery({ ...qs.plan, retry: false })
  const settings = useQuery({ ...qs.settings, retry: false })
  const loading = members.isLoading || mealSlots.isLoading || recipes.isLoading || plan.isLoading || settings.isLoading
  if (loading || !members.data || !mealSlots.data || !recipes.data || !plan.data || !settings.data) return { facts: null, loading }
  const slots = plan.data.slots ?? []
  const memberIds = members.data.map((m) => m.id).filter((id): id is number => id !== undefined)
  return {
    loading: false,
    facts: {
      members: members.data.length,
      mealSlots: mealSlots.data.length,
      mealSlotsWithAttendance: mealSlots.data.filter((m) => (m.attendance?.length ?? 0) > 0).length,
      recipes: recipes.data.length,
      // CRS G2: per Course (lib/setup planFacts).
      ...planFacts(slots),
      timeZoneConfigured: settings.data.timeZoneConfigured === true,
      setupHidden: settings.data.setupHidden === true,
      timeZone: settings.data.timeZone,
      currency: settings.data.currency,
      memberNames: members.data.map((m) => m.name ?? ''),
      ...mealSlotFacts(mealSlots.data, memberIds),
    },
  }
}
