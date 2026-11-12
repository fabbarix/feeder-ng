// Test data for Settings > Tags. By name the list reads: fish, Pasta, Roast, Seafood. With these colours the next colour is mustard.
import type { Tag, TagImpact } from '../../lib/tags'
import type { MergeImpact } from './types'

export const tagRow = (id: number, name: string, over: Partial<Tag> = {}): Tag => ({
  id,
  name,
  key: name.toLowerCase(),
  colour: 'sage',
  recipes: 0,
  slotRules: 0,
  varietyRule: false,
  ...over,
})

export const fish = tagRow(1, 'fish', { colour: 'sky', recipes: 12, slotRules: 1, varietyRule: true })
export const pasta = tagRow(2, 'Pasta', { colour: 'apricot', recipes: 3 })
export const seafood = tagRow(3, 'Seafood', { colour: 'teal', recipes: 4, varietyRule: true })
export const roast = tagRow(4, 'Roast', { colour: 'tomato', recipes: 0 })

/** Served in this (unsorted) order on purpose: the page sorts. */
export const allTags: Tag[] = [seafood, fish, roast, pasta]

export const fishRule = { id: 7, mealSlotId: 2, mealSlotName: 'Dinner', weekday: 5, courseId: 1, courseName: 'Main', tag: 'fish' }

/** What GET /api/tags/1/impact answers (the extras are the API's own: tg-api.md). */
export const fishImpact = {
  recipes: 12,
  slotRules: [fishRule],
  varietyRule: { tag: 'fish', maxPerWeek: 2, notConsecutiveDays: false },
} as unknown as TagImpact

/** GET /api/tags/1/impact?into=3 */
export const fishIntoSeafood = { ...fishImpact, bothRecipes: 4 } as unknown as MergeImpact

/** GET /api/tags/3/impact: Seafood has its own Variety Rule and no Slot Rule. */
export const seafoodImpact: TagImpact = { recipes: 4, slotRules: [], varietyRule: { tag: 'seafood', maxPerWeek: 3, notConsecutiveDays: true } }

/** GET /api/tags/4/impact: nothing uses Roast. */
export const roastImpact: TagImpact = { recipes: 0, slotRules: [], varietyRule: null }

export const MERGE_FISH_INTO_SEAFOOD =
  "fish comes off its 12 Recipes and Seafood goes on instead (4 already have both). Slot Rule Friday Dinner · Main = fish becomes = Seafood. fish's Variety Rule goes, because Seafood has its own."

export const DELETE_FISH =
  'fish is on 12 Recipes. Deleting it takes it off them. These go too: the Slot Rule Friday Dinner · Main = fish; the Variety Rule for fish.'
