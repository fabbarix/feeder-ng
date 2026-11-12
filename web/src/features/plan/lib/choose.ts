import { planStrings as s } from '../strings'
import type { Alternative, RecipeChoice } from '../types'
import { phraseAll, phraseWhy, type PhraseContext } from './phrase'

/** The Recipes whose name contains the query, ignoring case and surrounding spaces; every Recipe for an empty query. */
export function matchRecipes(recipes: RecipeChoice[], query: string): RecipeChoice[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return recipes
  return recipes.filter((r) => r.name.toLowerCase().includes(needle))
}

/** The alternative's meta line: its first phrased reason and the Leftover it would leave, joined by " · " (may be empty). */
export function swapMeta(reason: string | undefined, extra: string): string | undefined {
  const parts = [reason, extra].filter((p): p is string => Boolean(p))
  return parts.length > 0 ? parts.join(' · ') : undefined
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
