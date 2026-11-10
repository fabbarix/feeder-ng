import { http } from '../../lib/http'
import type {
  Alternative,
  CookedResult,
  CookPreview,
  Leftover,
  PlanSlot,
  PlanView,
  PlannedMeal,
  MealSlotChoice,
  RecipeChoice,
  SlotKey,
  SlotRule,
  TagChoice,
  VarietyRule,
} from './types'

const slotPath = (key: SlotKey) => `/api/plan/${key.date}/${key.mealSlotId}`

/** Planning API calls (routes in docs/dev/design/t11-planning.md). */
export const planApi = {
  view: (from?: string, to?: string) => {
    const q = new URLSearchParams()
    if (from) q.set('from', from)
    if (to) q.set('to', to)
    const s = q.toString()
    return http.get<PlanView>(`/api/plan${s ? `?${s}` : ''}`)
  },
  toConfirm: () => http.get<{ slots: PlanSlot[] }>('/api/plan/to-confirm'),
  couldntPlan: () => http.get<{ slots: PlanSlot[] }>('/api/plan/couldnt-plan'),
  leftovers: () => http.get<{ leftovers: Leftover[] }>('/api/plan/leftovers'),
  regenerate: () => http.post<void>('/api/plan/regenerate'),
  setMeal: (key: SlotKey, recipeId: number, batches?: number) =>
    http.put<PlannedMeal>(slotPath(key), batches === undefined ? { recipeId } : { recipeId, batches }),
  confirm: (key: SlotKey) => http.post<PlannedMeal>(`${slotPath(key)}/confirm`),
  unpin: (key: SlotKey) => http.post<PlannedMeal>(`${slotPath(key)}/unpin`),
  alternatives: (key: SlotKey) => http.get<{ alternatives: Alternative[] }>(`${slotPath(key)}/alternatives`),
  cookPreview: (key: SlotKey) => http.get<CookPreview>(`${slotPath(key)}/cook`),
  cooked: (key: SlotKey, leftoverPortions?: number) =>
    http.post<CookedResult>(`${slotPath(key)}/cooked`, leftoverPortions === undefined ? {} : { leftoverPortions }),
  notCooked: (key: SlotKey) => http.post<PlannedMeal>(`${slotPath(key)}/not-cooked`),

  slotRules: () => http.get<SlotRule[]>('/api/slot-rules'),
  addSlotRule: (body: { mealSlotId: number; recipeId?: number; tag?: string }) => http.post<SlotRule>('/api/slot-rules', body),
  removeSlotRule: (id: number) => http.delete<void>(`/api/slot-rules/${id}`),
  varietyRules: () => http.get<VarietyRule[]>('/api/variety-rules'),
  setVarietyRule: (rule: VarietyRule) =>
    http.put<VarietyRule>(`/api/variety-rules/${encodeURIComponent(rule.tag)}`, {
      maxPerWeek: rule.maxPerWeek,
      notConsecutiveDays: rule.notConsecutiveDays,
    }),
  removeVarietyRule: (tag: string) => http.delete<void>(`/api/variety-rules/${encodeURIComponent(tag)}`),

  /** Recipes to choose from when setting a meal or a Slot Rule. */
  recipeChoices: async (): Promise<RecipeChoice[]> => {
    const list = await http.get<{ id: number; name: string; tags?: string[]; imageUrl?: string; totalMinutes?: number }[]>('/api/recipes')
    return list.map((r) => ({ id: r.id, name: r.name, tags: r.tags ?? [], imageUrl: r.imageUrl || undefined, totalMinutes: r.totalMinutes }))
  },
  /** Read-only use of the recipes API: the existing Tags, for the Tag selects of the planning rules. */
  tags: () => http.get<TagChoice[]>('/api/tags'),
  mealSlots: () => http.get<MealSlotChoice[]>('/api/meal-slots'),
  /** One-tap Stock correction: T10's Set total. */
  setStockTotal: (ingredientId: number, total: number) => http.put<unknown>(`/api/stock/ingredients/${ingredientId}/total`, { total }),
}
