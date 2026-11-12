// Wire types of the Recipe File import/export API (docs/dev/design/t12-import-export.md) and of the Recipe Assistant reads
// (docs/dev/design/ai-recipe-import.md section 7, ra-c-service.md; WP-E/G: docs/dev/design/ra-e-import.md). camelCase, as the server sends them.
import type { RawImage } from '../../ui'

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
/** CRS E2: how a Course name of the file is answered. `add` and `unarchive` are Admin only (the server answers 403 otherwise). */
export type CourseAction = 'use' | 'skip' | 'add' | 'unarchive'
export interface CourseDecision {
  key: string
  action: CourseAction
  /** For action 'use': an active Course. */
  courseId?: number
}
export interface Decisions {
  ingredients: IngredientDecision[]
  conversions: ConversionAnswer[]
  recipes: RecipeDecision[]
  courses: CourseDecision[]
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
  /** IM3: the Ingredient this row resolves to exists without a picture and the file gives it one. Absent = false. */
  addsImage?: boolean
}
/** CRS E2: `exact` matches an active Course, `archived` an archived one, `unknown` none (docs/dev/design/crs-e1.md 3.2). */
export type CourseStatus = 'exact' | 'archived' | 'unknown'
export interface CourseMatch {
  /** The first spelling of the name in the file, cleaned. */
  name: string
  /** `course.NameKey` of the name. */
  key: string
  status: CourseStatus
  /** For exact and archived rows. */
  match?: { id: number; name: string; main: boolean; archived: boolean }
  /** The answer in force: the User's, else the default (use the main Course). */
  effective?: CourseDecision
  resolved: boolean
  /** JSON paths such as `$.recipes[2].courses[0]`. */
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
  /** CRS E2: one row per distinct Course name of the kept Recipes, first-seen order; [] when none. */
  courses: CourseMatch[]
  problems: Problem[]
  warnings: Warning[]
  ready: boolean
}
export interface ReviewResponse { id: string; plan: Plan }
export interface ImportResult {
  recipes: Array<{ index: number; id: number; name: string; action: 'created' | 'replaced' }>
  ingredientsCreated: number
  conversionsAdded: number
  /** CRS E2: Courses the import added or brought back (absent from an old answer = 0). */
  coursesCreated?: number
  coursesUnarchived?: number
}
export interface ExportableRecipe { id: number; name: string; imageUrl: string; archived: boolean }

/** What went wrong opening a file, read from the ApiError (codes: invalid_recipe_file, unsupported_version, invalid_json, file_too_large). */
export type FileError =
  | { kind: 'schema'; errors: PathError[] }
  | { kind: 'version'; version: string }
  | { kind: 'syntax' }
  | { kind: 'tooLarge' }
  | { kind: 'other'; message: string }

// ---- Recipe Assistant reads (WP-E / WP-G) ----

export type ReadKind = 'page' | 'text' | 'photo'
/** The server's job states. `done`, `failed` and `cancelled` are final. */
export type ReadState = 'fetching' | 'preparing' | 'reading' | 'checking' | 'images' | 'done' | 'failed' | 'cancelled'

/** What the User gave the "Read a recipe" step. Photos are the photo read's data URLs (or links), in page order. */
export type ReadInput =
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string }
  | { kind: 'photo'; photos: RawImage[] }

/** The POST /api/recipe-assistant/reads body: exactly one of these. */
export type ReadBody = { url: string } | { text: string } | { photos: Array<{ dataUrl: string } | { url: string }> }
export interface ReadStarted { id: string; state: ReadState }

/** The error of a failed read (GET .../reads/{id} `error`) or the body of a refused start (ApiError code + details). */
export interface ReadError {
  code: string
  message?: string
  retryAfterSeconds?: number
  errors?: PathError[]
  /** The display name of the model that declined (assistant_declined). */
  model?: string
}
export interface ReviewPhoto { index: number; width: number; height: number }
export interface ReadReview { id: string; plan: Plan; photos?: ReviewPhoto[] }
export interface ReadSource { kind: ReadKind; title?: string; url?: string; structuredData?: boolean; photoCount?: number }
export interface ReadView {
  id: string
  state: ReadState
  review?: ReadReview
  source?: ReadSource
  model?: { id: string; name: string }
  error?: ReadError
}

export type AssistantUnavailableReason = 'no_secret_key' | 'off' | 'no_key' | 'key_unreadable' | 'model_unavailable'
/** GET /api/recipe-assistant/status (any signed-in User). `limit` is omitted for Admins. */
export interface AssistantStatus {
  available: boolean
  reason?: AssistantUnavailableReason
  model?: { id: string; name: string }
  photos: boolean
  limit?: { remaining: number; resetsInSeconds: number }
}

/** Confirm's optional `photo`: candidate photo `index` becomes the image of Recipe `recipe` (both 0-based). */
export interface ConfirmPhoto { index: number; recipe: number }

/** What a finished read hands to Import Review (useImportReview.adopt). */
export interface AdoptedRead {
  id: string
  plan: Plan
  photos?: ReviewPhoto[]
  source?: ReadSource
  model?: { id: string; name: string }
}
/** The note chip(s) above an adopted review: "Read by Claude Haiku 5.5", "The page's recipe data was used as a hint". */
export interface ReadNoteInfo { modelName?: string; structuredData: boolean }
