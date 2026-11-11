// The one place Today reads the Members, Meal Slots, Recipes and the plan for the first-run checklist: counts only.
import { useQuery } from '@tanstack/react-query'
import { http } from '../../lib/http'
import type { SetupFacts } from './lib/setup'

interface SlotView {
  attendance?: unknown[]
}
interface PlanView {
  slots?: { meal?: unknown; unfilled?: unknown }[]
}

const qs = {
  members: { queryKey: ['members', 'setup'], queryFn: () => http.get<unknown[]>('/api/members') },
  mealSlots: { queryKey: ['meal-slots', 'setup'], queryFn: () => http.get<SlotView[]>('/api/meal-slots') },
  recipes: { queryKey: ['recipes', 'setup'], queryFn: () => http.get<unknown[]>('/api/recipes') },
  plan: { queryKey: ['plan', 'setup'], queryFn: () => http.get<PlanView>('/api/plan') },
}

/** Facts for the setup checklist. `facts` is null while loading and when any request fails (never a false first run). */
export function useSetupFacts(): { facts: SetupFacts | null; loading: boolean } {
  const members = useQuery({ ...qs.members, retry: false })
  const mealSlots = useQuery({ ...qs.mealSlots, retry: false })
  const recipes = useQuery({ ...qs.recipes, retry: false })
  const plan = useQuery({ ...qs.plan, retry: false })
  const loading = members.isLoading || mealSlots.isLoading || recipes.isLoading || plan.isLoading
  if (loading || !members.data || !mealSlots.data || !recipes.data || !plan.data) return { facts: null, loading }
  const slots = plan.data.slots ?? []
  return {
    loading: false,
    facts: {
      members: members.data.length,
      mealSlots: mealSlots.data.length,
      mealSlotsWithAttendance: mealSlots.data.filter((m) => (m.attendance?.length ?? 0) > 0).length,
      recipes: recipes.data.length,
      plannedMeals: slots.filter((x) => x.meal).length,
      unplannedMeals: slots.filter((x) => !x.meal && x.unfilled).length,
    },
  }
}
