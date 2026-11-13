import type { BaseUnit } from '../../lib/units'

/** ADR 0017: a Supply is an Ingredient of kind 'supply'. */
export type IngredientKind = 'food' | 'supply'

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
  /** BR-D: set when this is a Base recipe's Ingredient; null/absent for a plain Ingredient. */
  baseRecipe?: { id: number; name: string; archived: boolean } | null
  /** H2: food or supply; absent in older fixtures (read as food). */
  kind?: IngredientKind
  /** H2: a Supply's Restock level in Base Units; null/absent = none. */
  restockLevel?: number | null
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
  blocked: '' | 'base_unit_mismatch' | 'kind_differs'
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
  kind?: IngredientKind
  restockLevel?: number
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
  kind?: IngredientKind
  /** null clears the Restock level. */
  restockLevel?: number | null
}
