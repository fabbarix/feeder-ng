// Tag types: the GET /api/tags row, the impact payload of GET /api/tags/{id}/impact, and the colour ids (spec 4.1, 17).

/** The ten Tag colour ids, in palette order (spec 4.1). */
export type TagColourId = 'tomato' | 'apricot' | 'mustard' | 'olive' | 'sage' | 'teal' | 'sky' | 'blue' | 'plum' | 'rose'

/** One row of GET /api/tags (ordered by name). `colour` is a TagColourId, typed `string` so an unknown id from a newer server still renders (neutral). */
export interface Tag {
  id: number
  name: string
  /** `tag.NameKey` of the name: what Slot Rules and Variety Rules store. */
  key: string
  colour: string
  /** Recipes carrying the Tag, archived ones included. */
  recipes: number
  /** How many Slot Rules name it. */
  slotRules: number
  /** Whether a Variety Rule names it. */
  varietyRule: boolean
}

/** A Slot Rule as GET /api/tags/{id}/impact lists it (the shape of GET /api/slot-rules; names are added by the API). */
export interface ImpactSlotRule {
  id: number
  mealSlotId: number
  /** Absent or null: the rule has no Course (it applies to the Meal Slot's main Course). */
  courseId?: number | null
  tag?: string
}

export interface ImpactVarietyRule {
  tag: string
  maxPerWeek: number
  notConsecutiveDays: boolean
}

export interface TagImpact {
  recipes: number
  slotRules: ImpactSlotRule[]
  varietyRule: ImpactVarietyRule | null
}

export interface TagInput {
  name: string
  colour?: string
}

export interface TagPatch {
  name?: string
  colour?: string
}
