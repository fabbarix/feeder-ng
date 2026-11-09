// Wire types of the Recipe File import/export API (docs/dev/design/t12-import-export.md). camelCase, as the server sends them.

export type IngredientStatus = 'exact' | 'suggested' | 'new' | 'undefined' | 'conflict'
export type BaseUnit = 'g' | 'ml' | 'piece'
export type RecipeAction = 'replace' | 'keep_both' | 'skip'

export interface IngredientDecision {
  key: string
  action: 'use' | 'create'
  ingredientId?: number
  /** For action 'create': a new name (needed to resolve a Base Unit conflict by creating). */
  name?: string
  /** For action 'create': the Base Unit of an Ingredient the file does not define. */
  baseUnit?: BaseUnit
}
export interface ConversionAnswer { key: string; unit: string; toBase: number }
export interface RecipeDecision { index: number; action: RecipeAction }
export interface Decisions {
  ingredients: IngredientDecision[]
  conversions: ConversionAnswer[]
  recipes: RecipeDecision[]
}

export interface Suggestion { id: number; name: string; baseUnit: BaseUnit; score: number }
export interface IngredientMatch {
  name: string
  key: string
  status: IngredientStatus
  definition?: { name: string; baseUnit: BaseUnit; shelfLifeDays?: number; conversions?: Array<{ unit: string; toBase: number }> }
  match?: { id: number; name: string; baseUnit: BaseUnit }
  suggestions: Suggestion[]
  conflict?: { file: BaseUnit; existing: BaseUnit }
  effective?: IngredientDecision
  resolved: boolean
  usedBy: string[]
}
export interface UnitPrompt {
  key: string
  ingredient: string
  unit: string
  base: BaseUnit
  usedBy: string[]
  answered: boolean
  toBase?: number
}
export interface RecipeStatus {
  index: number
  name: string
  status: 'new' | 'conflict'
  existingId?: number
  action?: RecipeAction
  resolved: boolean
  importedAs?: string
}
export interface PathError { path: string; message: string }
export interface Problem { path: string; code: string; message: string }
export interface Warning { path: string; code: string; message: string }

export interface Plan {
  ingredients: IngredientMatch[]
  unitPrompts: UnitPrompt[]
  recipes: RecipeStatus[]
  problems: Problem[]
  warnings: Warning[]
  ready: boolean
}
export interface ReviewResponse { id: string; plan: Plan }
export interface ImportResult {
  recipes: Array<{ index: number; id: number; name: string; action: 'created' | 'replaced' }>
  ingredientsCreated: number
  conversionsAdded: number
}
export interface ExportableRecipe { id: number; name: string; imageUrl: string; archived: boolean }

/** What went wrong opening a file, read from the ApiError (codes: invalid_recipe_file, unsupported_version, invalid_json, file_too_large). */
export type FileError =
  | { kind: 'schema'; errors: PathError[] }
  | { kind: 'version'; version: string }
  | { kind: 'syntax' }
  | { kind: 'tooLarge' }
  | { kind: 'other'; message: string }
