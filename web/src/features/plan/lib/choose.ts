import { planStrings as s } from '../strings'
import type { Alternative, PlanCourse, PlanSlot, RecipeChoice, Why } from '../types'
import { courseOf, slotCourses } from './courses'
import { slotContext } from './days'
import { phraseAll, phraseWhy, type PhraseContext } from './phrase'
import { WHY_ICON, type RowChip } from './rowChips'

/** The Recipes whose name contains the query, ignoring case and surrounding spaces; every Recipe for an empty query. */
export function matchRecipes(recipes: RecipeChoice[], query: string): RecipeChoice[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return recipes
  return recipes.filter((r) => r.name.toLowerCase().includes(needle))
}

/**
 * The one reason a Swap row shows besides its Leftover. Priority: a Whole meal alternative that covers Courses
 * ("Whole meal: no Side", several: "Whole meal: no Side, no Dessert"), then a relaxed alternative's own relaxed chip
 * ("Again soon: had Tue"), then the first phrased why chip; undefined when there is nothing to say.
 */
export function alternativeNote(alternative: Alternative, ctx: PhraseContext): string | undefined {
  if (alternative.wholeMeal && alternative.covers && alternative.covers.length > 0) {
    return s.wholeMealNote(alternative.covers)
  }
  if (alternative.relaxed) {
    const relaxed = alternative.why.find((w) => w.code === 'cooldown_relaxed') ?? alternative.why.find((w) => w.code === 'variety_relaxed')
    if (relaxed) {
      const text = phraseWhy(relaxed, ctx)
      if (text) return text
    }
  }
  return phraseAll(alternative.why, ctx)[0]
}

/**
 * B9-38 (PC-10): Choose a Recipe's groups for a Course. A Course other than the main one splits the Recipes into those marked with
 * it ("Marked as Dessert") and the others ("Other Recipes", each with the info chip "Not marked as Dessert"); the main Course is one
 * group (`marked` holds every Recipe, `other` is empty). Each group keeps the order it was given.
 */
export function chooseGroups(recipes: RecipeChoice[], course: { id: number; main: boolean }): { marked: RecipeChoice[]; other: RecipeChoice[] } {
  if (course.main) return { marked: recipes, other: [] }
  const marked: RecipeChoice[] = []
  const other: RecipeChoice[] = []
  for (const r of recipes) (r.courseIds?.includes(course.id) ? marked : other).push(r)
  return { marked, other }
}

/** B9-38 (PC-10): the Course a sheet opened from a slot is for: the one asked for, else the main Course, else the first. */
export function sheetCourse(slot: PlanSlot, courseId?: number): PlanCourse | undefined {
  const courses = slotCourses(slot)
  return courseOf(slot, courseId) ?? courses.find((c) => c.main) ?? courses[0]
}

/** B9-38 (PC-10): "Tue 17 · Breakfast · Main": Swap and Choose a Recipe always name the Course. */
export function chooserContext(slot: PlanSlot, courseId?: number): string {
  return slotContext({ date: slot.date, slotName: slot.name, courseName: sheetCourse(slot, courseId)?.name })
}

/** B9-38 (PC-10): the why chips of a Recipe row in Swap or Choose a Recipe, each with its glyph; the row's one reason first. */
export function reasonChips(why: Why[], ctx: PhraseContext, first?: string): RowChip[] {
  const out: RowChip[] = []
  const seen = new Set<string>()
  const add = (label: string | undefined, icon?: RowChip['icon']) => {
    if (!label || seen.has(label)) return
    seen.add(label)
    out.push({ key: `why:${label}`, kind: 'why', icon, label })
  }
  const firstWhy = first ? why.find((w) => phraseWhy(w, ctx) === first) : undefined
  add(first, firstWhy ? WHY_ICON[firstWhy.code] : undefined)
  for (const w of why) add(phraseWhy(w, ctx), WHY_ICON[w.code])
  return out.slice(0, 3)
}

/** B9-38: an alternative's chips: its note (Whole meal, relaxed) first, then its phrased reasons. */
export function alternativeChips(alternative: Alternative, ctx: PhraseContext): RowChip[] {
  return reasonChips(alternative.why, ctx, alternativeNote(alternative, ctx))
}

/**
 * B9-38 (PC-10): the list Choose a Recipe gets for a Course other than the main one: the Recipes the server marks with it
 * (`?course=`), then every other Recipe ("Other Recipes"), each once, so chooseGroups can split them by `courseIds`.
 */
export function chooserRecipes(marked: RecipeChoice[], all: RecipeChoice[], courseId: number): RecipeChoice[] {
  const ids = new Set(marked.map((r) => r.id))
  const mark = (r: RecipeChoice): RecipeChoice => (r.courseIds?.includes(courseId) ? r : { ...r, courseIds: [...(r.courseIds ?? []), courseId] })
  const unmark = (r: RecipeChoice): RecipeChoice => (r.courseIds?.includes(courseId) ? { ...r, courseIds: r.courseIds.filter((c) => c !== courseId) } : r)
  return [...marked.map(mark), ...all.filter((r) => !ids.has(r.id)).map(unmark)]
}
