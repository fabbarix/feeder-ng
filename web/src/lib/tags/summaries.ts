// Facts for the merge and delete confirms (spec 4.1). The components phrase them; nothing here returns copy.
import type { ImpactSlotRule, ImpactVarietyRule, Tag, TagImpact } from './types'

export interface MergeSummary {
  source: string
  target: string
  /** Recipes that carry the source Tag. */
  recipes: number
  /** Of those, how many already carry the target (0 when unknown). */
  bothRecipes: number
  /** The source's Slot Rules that move to the target. */
  movedRules: ImpactSlotRule[]
  /** The source's Slot Rules that go, because the target has one on the same Meal Slot and Course. */
  droppedRules: ImpactSlotRule[]
  /** The source's Variety Rule: moves (target has none), goes (target has its own) or the source has none. */
  varietyRule: 'moves' | 'goes' | 'none'
}

export interface MergeSummaryInput {
  source: Pick<Tag, 'name'>
  target: Pick<Tag, 'name'>
  sourceImpact: TagImpact
  targetImpact: TagImpact
  /** Recipes with both Tags, when the caller knows it. */
  bothRecipes?: number
}

const courseOf = (rule: ImpactSlotRule): number | null => rule.courseId ?? null

export function mergeSummary(input: MergeSummaryInput): MergeSummary {
  const { sourceImpact, targetImpact } = input
  const taken = (rule: ImpactSlotRule) => targetImpact.slotRules.some((t) => t.mealSlotId === rule.mealSlotId && courseOf(t) === courseOf(rule))
  const droppedRules = sourceImpact.slotRules.filter(taken)
  const movedRules = sourceImpact.slotRules.filter((rule) => !taken(rule))
  let varietyRule: MergeSummary['varietyRule'] = 'none'
  if (sourceImpact.varietyRule) varietyRule = targetImpact.varietyRule ? 'goes' : 'moves'
  return {
    source: input.source.name,
    target: input.target.name,
    recipes: sourceImpact.recipes,
    bothRecipes: input.bothRecipes ?? 0,
    movedRules,
    droppedRules,
    varietyRule,
  }
}

export interface DeleteSummary {
  name: string
  recipes: number
  rules: ImpactSlotRule[]
  varietyRule: ImpactVarietyRule | null
  /** True when any rule goes with the Tag. */
  hasRules: boolean
}

export function deleteSummary(input: { tag: Pick<Tag, 'name'>; impact: TagImpact }): DeleteSummary {
  const { impact } = input
  return {
    name: input.tag.name,
    recipes: impact.recipes,
    rules: impact.slotRules,
    varietyRule: impact.varietyRule,
    hasRules: impact.slotRules.length > 0 || impact.varietyRule !== null,
  }
}
