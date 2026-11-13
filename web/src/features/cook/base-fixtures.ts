// BR-H test support: Cook Mode payloads of a Recipe that calls for a Base recipe, shaped as BR-G sends them
// (internal/cook/httpapi/timeline.go and httpapi.go; tests br_g_test.go, br_g_round3_test.go).
//
// Lasagne calls for 500 g of Béchamel. Béchamel has "Melt the butter" (5 min Active) and "Simmer the sauce" (20 min Passive),
// Lasagne has "Layer the lasagne" and "Bake". The composed list puts Béchamel's block first, so the indexes are the composed
// ones: 0 Melt, 1 Simmer (after 0), 2 Layer (after 1), 3 Bake (after 2). `baseRecipe` is null for the Recipe's own Steps,
// `covered` is an array (never null), and a timer on a Base recipe Step is labelled "Path: text".
import type { BaseRecipeLabel, CookStep, CookView, TimelineAdvance, TimelineItem, TimelineView } from './types'
import { MAIN_SCOPE } from './timeline-fixtures'

export const BECHAMEL: BaseRecipeLabel = { id: 31, name: 'Béchamel', path: ['Béchamel'] }
/** A Base recipe inside Béchamel: its name is the innermost one, its path starts at the outermost. */
export const ROUX: BaseRecipeLabel = { id: 32, name: 'Roux', path: ['Béchamel', 'Roux'] }
export const FROLLA: BaseRecipeLabel = { id: 33, name: 'Pasta frolla', path: ['Pasta frolla'] }

export function baseItem(over: Partial<TimelineItem> & Pick<TimelineItem, 'step' | 'number' | 'text'>): TimelineItem {
  return {
    courseId: 1, scope: MAIN_SCOPE, kind: 'active', durationMinutes: 10, startSeconds: 0, endSeconds: 600, uses: [], imageUrl: '', timer: null, after: [],
    baseRecipe: null, ...over,
  }
}

export const MELT = baseItem({ step: 0, number: 1, text: 'Melt the butter', durationMinutes: 5, endSeconds: 300, baseRecipe: BECHAMEL })
export const SIMMER = baseItem({
  step: 1, number: 2, text: 'Simmer the sauce', kind: 'passive', durationMinutes: 20, startSeconds: 300, endSeconds: 1500, after: [0], baseRecipe: BECHAMEL,
  timer: { label: 'Béchamel: Simmer the sauce', durationSeconds: 1200 },
})
export const LAYER = baseItem({ step: 2, number: 3, text: 'Layer the lasagne', startSeconds: 1500, endSeconds: 2100, after: [1] })
export const BAKE = baseItem({
  step: 3, number: 4, text: 'Bake', kind: 'passive', durationMinutes: 30, startSeconds: 2100, endSeconds: 3900, after: [2],
  timer: { label: 'Lasagne: Bake', durationSeconds: 1800 },
})

const lasagneCourse = { courseId: 1, name: 'Main', recipeId: 7, recipeName: 'Lasagne', scope: MAIN_SCOPE, batches: 1, fresh: true, state: 'planned' as const }

function view(over: Partial<TimelineView> = {}): TimelineView {
  return {
    date: '2026-11-10', mealSlotId: 4, slotName: 'Dinner', time: '19:00', startAt: '2026-11-10T17:55:00Z', totalMinutes: 65,
    courses: [lasagneCourse], advance: [], items: [MELT, SIMMER, LAYER, BAKE], covered: [], ...over,
  }
}

/** Béchamel is made: four Steps, the first two labelled. */
export const baseTimeline = (over: Partial<TimelineView> = {}): TimelineView => view(over)

/** Béchamel has an Advance Step of its own ("Chill the milk"), Lasagne has one too ("Buy fresh pasta"). */
export function baseAdvance(): TimelineAdvance[] {
  return [
    { courseId: 1, scope: MAIN_SCOPE, step: 4, text: 'Chill the milk', leadTimeMinutes: 240, done: false, doneAt: null, warning: true, baseRecipe: BECHAMEL },
    { courseId: 1, scope: MAIN_SCOPE, step: 5, text: 'Rest the dough', leadTimeMinutes: 120, done: true, doneAt: '2026-11-10T08:00:00Z', warning: false, baseRecipe: FROLLA },
    { courseId: 1, scope: MAIN_SCOPE, step: 6, text: 'Buy fresh pasta', leadTimeMinutes: 60, done: false, doneAt: null, warning: true, baseRecipe: null },
  ]
}

/** A full jar covers Béchamel: its Steps are left out, "Step n of m" counts the two shown, indexes stay composed. */
export function coveredTimeline(): TimelineView {
  return view({
    totalMinutes: 40,
    items: [{ ...LAYER, number: 1, startSeconds: 0, endSeconds: 600, after: [] }, { ...BAKE, number: 2, startSeconds: 600, endSeconds: 2400 }],
    covered: [BECHAMEL],
  })
}

/** Béchamel calls for Roux: Roux's Steps are labelled with the path; the Roux block ends inside Béchamel's. */
export function nestedTimeline(): TimelineView {
  const whisk = baseItem({ step: 0, number: 1, text: 'Cook the roux', durationMinutes: 5, endSeconds: 300, baseRecipe: ROUX })
  const simmer = baseItem({
    step: 1, number: 2, text: 'Simmer the sauce', kind: 'passive', durationMinutes: 20, startSeconds: 300, endSeconds: 1500, after: [0], baseRecipe: BECHAMEL,
    timer: { label: 'Béchamel: Simmer the sauce', durationSeconds: 1200 },
  })
  const rouxPassive = baseItem({
    step: 2, number: 3, text: 'Rest the roux', kind: 'passive', durationMinutes: 5, startSeconds: 1500, endSeconds: 1800, after: [1], baseRecipe: ROUX,
    timer: { label: 'Béchamel · Roux: Rest the roux', durationSeconds: 300 },
  })
  const layer = { ...LAYER, step: 3, number: 4, after: [2], startSeconds: 1800, endSeconds: 2400 }
  return view({ totalMinutes: 40, items: [whisk, simmer, rouxPassive, layer] })
}

// ---- the single-Recipe view (GET /api/cook/recipes/{id}?batches=) ----

const viewStep = (i: TimelineItem, number: number, of: number): CookStep => ({
  index: i.step ?? 0, number, of, kind: i.kind === 'passive' ? 'passive' : 'active', text: i.text, durationMinutes: i.durationMinutes, imageUrl: '',
  uses: [], timer: i.timer, after: i.after, baseRecipe: i.baseRecipe,
})

export function baseCookView(over: Partial<CookView> = {}): CookView {
  const items = [MELT, SIMMER, LAYER, BAKE]
  return {
    scope: 'recipe:7', recipeId: 7, recipeName: 'Lasagne', batches: 1, meal: null, today: '2026-11-10', advance: [], timers: [],
    steps: items.map((i, n) => viewStep(i, n + 1, items.length)), covered: [], ...over,
  }
}

export function coveredCookView(): CookView {
  return baseCookView({ steps: [viewStep(LAYER, 1, 2), viewStep(BAKE, 2, 2)], covered: [BECHAMEL] })
}
