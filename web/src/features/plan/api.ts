import { http } from '../../lib/http'
import type {
  Alternative,
  CookedAllEntry,
  CookedAllResult,
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

/** STUB (CRS F): a key with a courseId must give `/api/plan/<date>/<slot>/<course>`; without one, the course-less alias. */
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
  /**
   * STUB (CRS F): POST /api/plan/<date>/<slot>/all/cooked, body `{ courses }` (the key left out when none is given).
   * Marks every unresolved Course Cooked in one step.
   */
  cookedAll: (_slot: SlotKey, _courses?: CookedAllEntry[]): Promise<CookedAllResult> => Promise.reject(new Error('CRS F: not implemented')),
  /** STUB (CRS F): POST /api/plan/<date>/<slot>/all/not-cooked, no body. Answers `{ meals }`. */
  notCookedAll: (_slot: SlotKey): Promise<{ meals: PlannedMeal[] }> => Promise.reject(new Error('CRS F: not implemented')),

  slotRules: () => http.get<SlotRule[]>('/api/slot-rules'),
  addSlotRule: (body: { mealSlotId: number; courseId?: number; recipeId?: number; tag?: string }) => http.post<SlotRule>('/api/slot-rules', body),
  removeSlotRule: (id: number) => http.delete<void>(`/api/slot-rules/${id}`),
  varietyRules: () => http.get<VarietyRule[]>('/api/variety-rules'),
  setVarietyRule: (rule: VarietyRule) =>
    http.put<VarietyRule>(`/api/variety-rules/${encodeURIComponent(rule.tag)}`, {
      maxPerWeek: rule.maxPerWeek,
      notConsecutiveDays: rule.notConsecutiveDays,
    }),
  removeVarietyRule: (tag: string) => http.delete<void>(`/api/variety-rules/${encodeURIComponent(tag)}`),

  /** Recipes to choose from when setting a meal or a Slot Rule. */
  /**
   * STUB (CRS F): with a courseId the request is `GET /api/recipes?course=<id>` (the Recipes marked with it), and every
   * choice carries `courseIds` from the Recipe's `courses: [{ id }]`. Without one it is as before.
   */
  recipeChoices: async (_courseId?: number): Promise<RecipeChoice[]> => {
    const list = await http.get<{ id: number; name: string; tags?: string[]; imageUrl?: string; totalMinutes?: number }[]>('/api/recipes')
    return list.map((r) => ({ id: r.id, name: r.name, tags: r.tags ?? [], imageUrl: r.imageUrl || undefined, totalMinutes: r.totalMinutes }))
  },
  /** Read-only use of the recipes API: the existing Tags, for the Tag selects of the planning rules. */
  tags: () => http.get<TagChoice[]>('/api/tags'),
  mealSlots: () => http.get<MealSlotChoice[]>('/api/meal-slots'),
  /** One-tap Stock correction: T10's Set total. */
  setStockTotal: (ingredientId: number, total: number) => http.put<unknown>(`/api/stock/ingredients/${ingredientId}/total`, { total }),
}
