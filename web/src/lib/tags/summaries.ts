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

export function mergeSummary(input: MergeSummaryInput): MergeSummary {
  void input
  throw new Error('TG-UI: not implemented')
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
  void input
  throw new Error('TG-UI: not implemented')
}
