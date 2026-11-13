import { http } from '../../lib/http'
import type { RegenerateDryRun } from './lib/bought'
import type {
  Alternative,
  CookedAllEntry,
  CookedAllResult,
  CookedResult,
  CookPreview,
  ExclusionCell,
  Leftover,
  PlanEntry,
  PlanView,
  PlannedMeal,
  MealSlotChoice,
  NotServedPreview,
  RecipeChoice,
  SlotDateInfo,
  SlotDatePatch,
  SlotDayKey,
  SlotKey,
  SlotRule,
  TagChoice,
  VarietyRule,
} from './types'

/** A Planned Meal key is `/api/plan/<date>/<slot>/<course>`: a key without its Course is refused before any request (crs-c3 §1). */
const slotPath = (key: SlotKey) => {
  if (!Number.isInteger(key.courseId)) throw new Error('A Planned Meal key needs its Course')
  return `/api/plan/${key.date}/${key.mealSlotId}/${key.courseId}`
}
const slotDayPath = (key: SlotDayKey) => `/api/plan/${key.date}/${key.mealSlotId}`

/** Planning API calls (routes in docs/dev/design/t11-planning.md). */
export const planApi = {
  view: (from?: string, to?: string) => {
    const q = new URLSearchParams()
    if (from) q.set('from', from)
    if (to) q.set('to', to)
    const s = q.toString()
    return http.get<PlanView>(`/api/plan${s ? `?${s}` : ''}`)
  },
  toConfirm: () => http.get<{ slots: PlanEntry[] }>('/api/plan/to-confirm'),
  couldntPlan: () => http.get<{ slots: PlanEntry[] }>('/api/plan/couldnt-plan'),
  /** CRS G2 (RX): every cell held back by an Exclusion, with who excluded what. Every User may read it. */
  couldntExclusions: () => http.get<{ cells: ExclusionCell[] }>('/api/plan/couldnt-plan/exclusions'),
  leftovers: () => http.get<{ leftovers: Leftover[] }>('/api/plan/leftovers'),
  regenerate: () => http.post<void>('/api/plan/regenerate'),
  /** B5-BOW: what Regenerate would replace, with the Bought Planned Meals named (POST ?dryRun=1; writes nothing). */
  regenerateDryRun: () => http.post<RegenerateDryRun>('/api/plan/regenerate?dryRun=1'),
  setMeal: (key: SlotKey, recipeId: number, batches?: number) =>
    http.put<PlannedMeal>(slotPath(key), batches === undefined ? { recipeId } : { recipeId, batches }),
  confirm: (key: SlotKey) => http.post<PlannedMeal>(`${slotPath(key)}/confirm`),
  unpin: (key: SlotKey) => http.post<PlannedMeal>(`${slotPath(key)}/unpin`),
  alternatives: (key: SlotKey) => http.get<{ alternatives: Alternative[] }>(`${slotPath(key)}/alternatives`),
  cookPreview: (key: SlotKey) => http.get<CookPreview>(`${slotPath(key)}/cook`),
  cooked: (key: SlotKey, leftoverPortions?: number) =>
    http.post<CookedResult>(`${slotPath(key)}/cooked`, leftoverPortions === undefined ? {} : { leftoverPortions }),
  notCooked: (key: SlotKey) => http.post<PlannedMeal>(`${slotPath(key)}/not-cooked`),
  /** POST /api/plan/<date>/<slot>/all/cooked, body `{ courses }` (no body when none is given): every unresolved Course Cooked in one step. */
  cookedAll: (slot: SlotDayKey, courses?: CookedAllEntry[]) =>
    http.post<CookedAllResult>(`${slotDayPath(slot)}/all/cooked`, courses === undefined ? undefined : { courses }),
  /** POST /api/plan/<date>/<slot>/all/not-cooked, no body. Answers `{ meals }`. */
  notCookedAll: (slot: SlotDayKey) => http.post<{ meals: PlannedMeal[] }>(`${slotDayPath(slot)}/all/not-cooked`),

  /** B5-F1: one Meal Slot on one date (every User). */
  slotDate: (mealSlotId: number, date: string) => http.get<SlotDateInfo>(`/api/meal-slots/${mealSlotId}/dates/${date}`),
  /** B5-F1: PATCH presence-aware: only the keys given change; `time: null` is the usual time. Answers the GET shape. */
  patchSlotDate: (mealSlotId: number, date: string, body: SlotDatePatch) =>
    http.patch<SlotDateInfo>(`/api/meal-slots/${mealSlotId}/dates/${date}`, body),
  /** B5-F1: what Not served would remove; nothing is written (PATCH ?dryRun=1 with notServed: true). */
  notServedPreview: (mealSlotId: number, date: string) =>
    http.patch<NotServedPreview>(`/api/meal-slots/${mealSlotId}/dates/${date}?dryRun=1`, { notServed: true }),

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
   * CRS F: with a courseId the request is `GET /api/recipes?course=<id>` (the Recipes marked with it), and every
   * choice carries `courseIds` from the Recipe's `courses: [{ id }]`. Without one it is as before.
   */
  recipeChoices: async (courseId?: number): Promise<RecipeChoice[]> => {
    const path = courseId === undefined ? '/api/recipes' : `/api/recipes?course=${courseId}`
    const list = await http.get<{ id: number; name: string; tags?: string[]; imageUrl?: string; totalMinutes?: number; courses?: { id: number }[] }[]>(path)
    return list.map((r) => ({
      id: r.id,
      name: r.name,
      tags: r.tags ?? [],
      imageUrl: r.imageUrl || undefined,
      totalMinutes: r.totalMinutes,
      courseIds: (r.courses ?? []).map((c) => c.id),
    }))
  },
  /** Read-only use of the recipes API: the existing Tags, for the Tag selects of the planning rules. */
  tags: () => http.get<TagChoice[]>('/api/tags'),
  mealSlots: () => http.get<MealSlotChoice[]>('/api/meal-slots'),
  /** One-tap Stock correction: T10's Set total. */
  setStockTotal: (ingredientId: number, total: number) => http.put<unknown>(`/api/stock/ingredients/${ingredientId}/total`, { total }),
}
