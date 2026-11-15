import { http } from '../../lib/http'
import type { RegenerateDryRun } from './lib/bought'
import type { PlanChange } from './lib/replan'

/** B9-46: a Member as the Away sheet's Who pills need them (GET /api/members; Settings' Member fits). */
export interface AwayMember {
  id: number
  name: string
  colour: string
  avatar: string
  photoUrl?: string
}

/** B9-24 (PC-08): the answer of an Away write: the Away, what the replan changed, and the Undo's token. */
export type AwayAnswer = Away & { changes: PlanChange[]; undoToken?: string }

/** B9-32: the answer of POST /api/courses/<id>/recipes. */
export interface MarkRecipesResult {
  marked: number
  /** The Recipes this call newly marked (absent from an old server: then there is no Undo). */
  markedIds?: number[]
  changes: PlanChange[]
  undoToken?: string
}

/** B9-32: the answer of POST /api/courses/<id>/recipes/unmark. */
export interface UnmarkRecipesResult {
  unmarked: number
  unmarkedIds: number[]
  changes: PlanChange[]
  undoToken?: string
}
import type {
  Alternative,
  Away,
  AwayPreview,
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

/** B9-11: what every replanning write adds to its answer: the cells it changed beyond its target and the token that undoes it (none when it issued none). */
export interface ReplanFields {
  changes?: PlanChange[]
  undoToken?: string
}
/** B9-11: a write on a Planned Meal answers the meal with `changes` and `undoToken`. */
export type PlanWriteResult = PlannedMeal & ReplanFields & { covered?: number[] }
/** B9-11: POST /api/plan/regenerate; `changed` is how many Planned Meals changed (no token when it is 0). */
export interface RegenerateResult extends ReplanFields {
  placed: number
  kept: number
  unfilled: number
  changed: number
}
/** B9-11: POST .../reopen and .../all/reopen: the meals open again and how many Stock Lots were already gone. */
export interface ReopenResult {
  meals: PlannedMeal[]
  stockGone: number
}

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
  regenerate: () => http.post<RegenerateResult>('/api/plan/regenerate'),
  /**
   * B9-32 (PC-07): POST /api/courses/<id>/recipes `{ recipeIds }` marks Recipes with a Course and replans once. `marked` is how many
   * Recipes gained it and `markedIds` which (the Undo unmarks exactly those). Any User. 422 `validation_failed` on `recipeIds`, 404.
   */
  markRecipes: (courseId: number, recipeIds: number[]) => http.post<MarkRecipesResult>(`/api/courses/${courseId}/recipes`, { recipeIds }),
  /** B9-32 (ruling 2): the Undo of markRecipes: POST /api/courses/<id>/recipes/unmark `{ recipeIds }` takes the Course off them and replans. */
  unmarkRecipes: (courseId: number, recipeIds: number[]) => http.post<UnmarkRecipesResult>(`/api/courses/${courseId}/recipes/unmark`, { recipeIds }),
  /** B9-46: the Household's Members (the Away sheet's Who pills); the same read as Settings' (key ['household', 'members']). */
  members: () => http.get<AwayMember[]>('/api/members'),
  /** B9-24 (PC-08): a Member's running and coming Aways, soonest first. */
  memberAways: (memberId: number) => http.get<Away[]>(`/api/members/${memberId}/away`),
  /** B9-24: the dry run of a new Away (POST …?dryRun=1) or of a change to one (PATCH /api/away/{id}?dryRun=1). Nothing is written. */
  awayPreview: (memberId: number, body: Record<string, unknown>, awayId?: number) =>
    awayId === undefined ? http.post<AwayPreview>(`/api/members/${memberId}/away?dryRun=1`, body) : http.patch<AwayPreview>(`/api/away/${awayId}?dryRun=1`, body),
  /** B9-24: 201 the Away with the replan's `changes` and `undoToken`; 422 `validation_failed` with `field` and `reason`. */
  createAway: (memberId: number, body: Record<string, unknown>) => http.post<AwayAnswer>(`/api/members/${memberId}/away`, body),
  updateAway: (awayId: number, body: Record<string, unknown>) => http.patch<AwayAnswer>(`/api/away/${awayId}`, body),
  /** B9-24: ends a running Away after the Meal Slot that is on now; 409 `away_not_started` | `away_over`. */
  endAway: (awayId: number) => http.post<AwayAnswer>(`/api/away/${awayId}/end`),
  /** B9-24: removes an Away that has not started; 409 `away_started`. */
  removeAway: (awayId: number) => http.delete<{ id: number; changes: PlanChange[]; undoToken?: string }>(`/api/away/${awayId}`),
  /** B9-11: POST /api/plan/restore { undoToken }: writes the plan back exactly, no replan. 409 `plan_changed`, 404 `not_found`. */
  restore: (undoToken: string) => http.post<{ changes: PlanChange[] }>('/api/plan/restore', { undoToken }),
  /** B9-11: POST .../{courseId}/reopen: Cooked or Not cooked taken back (every Course of the same Mark all). 409 `leftover_used`, `reopen_window_over`. */
  reopen: (key: SlotKey) => http.post<ReopenResult>(`${slotPath(key)}/reopen`),
  /** B9-11: POST .../all/reopen: every marked Course of the slot occurrence. */
  reopenAll: (slot: SlotDayKey) => http.post<ReopenResult>(`${slotDayPath(slot)}/all/reopen`),
  /** B5-BOW: what Regenerate would replace, with the Bought Planned Meals named (POST ?dryRun=1; writes nothing). */
  regenerateDryRun: () => http.post<RegenerateDryRun>('/api/plan/regenerate?dryRun=1'),
  /** B9-38: `markCourse` (a pick from "Other Recipes") marks the Recipe with the key's Course and sets it in the same write. */
  setMeal: (key: SlotKey, recipeId: number, batches?: number, markCourse?: boolean) =>
    http.put<PlanWriteResult>(slotPath(key), { recipeId, ...(batches === undefined ? {} : { batches }), ...(markCourse ? { markCourse: true } : {}) }),
  /** B5-LOW: pins a Leftover (not taken out of the Freezer) to the Planned Meal of a Course; `{ leftoverId }` instead of a Recipe. */
  pickLeftover: (key: SlotKey, leftoverId: number) => http.put<PlanWriteResult>(slotPath(key), { leftoverId }),
  confirm: (key: SlotKey) => http.post<PlanWriteResult>(`${slotPath(key)}/confirm`),
  unpin: (key: SlotKey) => http.post<PlanWriteResult>(`${slotPath(key)}/unpin`),
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
