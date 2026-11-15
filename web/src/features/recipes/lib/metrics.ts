// B9-27 (RX-06, RX-07, RX-13): the words of Recipe detail's metric strip, a value and a label per Tile. Plain TypeScript.
import { yieldText } from '../../../lib/baseRecipes/yield'
import { recipeStrings } from '../strings'
import { formatMinutes } from './time'
import { timeSummary } from './timeSummary'

export interface RecipeMetricFacts {
  yieldValue: number
  yieldUnit?: string | null
  baseRecipe?: boolean
  stepCount?: number
  totalMinutes: number
  advanceMinutes: number
}

export interface RecipeMetricWords {
  yield: { value: string; label: string }
  time: { value: string; label: string }
  /** "+ 12 h ahead" under a timed total; null otherwise (an Advance Step alone is the time metric itself). */
  ahead: string | null
}

/**
 * The Yield: a plannable Recipe "4" / "portions per Batch"; a Base recipe its amount with its unit, "800 g" / "per Batch".
 * The time: "37 min" / "cooking"; untimed Steps "No time set" / "2 Steps, none timed"; an Advance Step alone "+ 2 h ahead"; else "No Steps".
 */
export function metricsOf(f: RecipeMetricFacts): RecipeMetricWords {
  const s = recipeStrings
  const yieldWords = f.baseRecipe
    ? { value: yieldText(f.yieldValue, f.yieldUnit), label: s.perBatch }
    : { value: String(f.yieldValue), label: s.portionsPerBatch(f.yieldValue) }
  const time = timeSummary(f)
  const ahead = time.ahead ? s.aheadMetric(formatMinutes(f.advanceMinutes)) : null
  if (time.total) return { yield: yieldWords, time: { value: time.total, label: s.cookingLabel }, ahead }
  if (time.untimedSteps !== null) return { yield: yieldWords, time: { value: s.noTimeSet, label: s.untimedSteps(time.untimedSteps) }, ahead: null }
  if (ahead) return { yield: yieldWords, time: { value: ahead, label: '' }, ahead: null }
  return { yield: yieldWords, time: { value: s.noSteps, label: '' }, ahead: null }
}
