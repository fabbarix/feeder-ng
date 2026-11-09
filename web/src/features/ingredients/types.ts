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
  conversions: Conversion[]
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
}

export interface IngredientPatch {
  name?: string
  baseUnit?: BaseUnit
  /** null clears it. */
  shelfLifeDays?: number | null
}
