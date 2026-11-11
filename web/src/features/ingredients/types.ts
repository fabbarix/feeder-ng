import type { BaseUnit } from '../../lib/units'

export interface Conversion {
  unit: string
  toBase: number
}

export interface Ingredient {
  id: number
  name: string
  baseUnit: BaseUnit
  shelfLifeDays: number | null
  /** Pantry: the Shelf Life in a Freezer; null = the Freezer does not change the go-off date (absent in older fixtures). */
  frozenShelfLifeDays?: number | null
  conversions: Conversion[]
  /** IM2: the picture's image id, '' = none. The server always sends it (optional here so older fixtures compile). */
  image?: string
  /** IM2: '/api/images/<image>' or ''. */
  imageUrl?: string
}

/** GET /api/ingredients/{id}: the Ingredient plus what other features use it (label -> count). */
export interface IngredientDetail extends Ingredient {
  references: Record<string, number>
}

export interface Suggestion {
  ingredient: Ingredient
  score: number
}

export interface SearchResult {
  exact: Ingredient | null
  suggestions: Suggestion[]
}

export type ConflictKind = 'conversion' | 'shelfLife'

export interface Conflict {
  kind: ConflictKind
  /** Set for kind 'conversion'. */
  unit: string
  source: number
  target: number
}

export interface MergePreview {
  source: Ingredient
  target: Ingredient
  /** '' when the merge can go ahead, 'base_unit_mismatch' when it cannot. */
  blocked: '' | 'base_unit_mismatch'
  conversions: Conversion[]
  shelfLifeDays: number | null
  conflicts: Conflict[]
  sourceReferences: Record<string, number>
  targetReferences: Record<string, number>
}

export interface MergeRequest {
  into: number
  resolutions?: {
    conversions?: Record<string, number>
    /** Present = answered; null = "no Shelf Life". */
    shelfLifeDays?: number | null
  }
}

export interface NewIngredient {
  name: string
  baseUnit: BaseUnit
  shelfLifeDays?: number | null
  conversions?: Conversion[]
  /** IM2: image id from the ImagePicker; leave out for no picture. */
  image?: string
}

export interface IngredientPatch {
  name?: string
  baseUnit?: BaseUnit
  /** null clears it. */
  shelfLifeDays?: number | null
  /** Pantry: null clears it. */
  frozenShelfLifeDays?: number | null
  /** IM2: an image id sets the picture, '' removes it, absent leaves it. */
  image?: string
}
