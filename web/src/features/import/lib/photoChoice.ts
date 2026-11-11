// "Use this photo for the Recipe" in Import Review (docs/dev/design/ra-e-import.md section 4.5). Plain TypeScript, no React.
import type { ConfirmPhoto, Decisions, Plan } from '../types'

export interface PhotoChoice {
  /** The switch. Off by default. */
  enabled: boolean
  /** Candidate photo, 0-based. */
  photo: number
  /** Recipe (its index in the file), 0-based. */
  recipe: number
}
export interface PhotoRecipeOption { index: number; name: string }

export function initialPhotoChoice(): PhotoChoice {
  return { enabled: false, photo: 0, recipe: 0 }
}
/** The Recipes that can get the photo: all except those whose effective action is skip. */
export function photoRecipes(plan: Plan | undefined, decisions: Decisions): PhotoRecipeOption[] {
  if (!plan) return []
  const decided = new Map(decisions.recipes.map((d) => [d.index, d.action]))
  return plan.recipes
    .filter((r) => (decided.get(r.index) ?? r.action) !== 'skip')
    .map((r) => ({ index: r.index, name: r.name }))
}
/** Keeps the choice valid: photo within 0..count-1, recipe within the options (else the first); switch off when there is nothing to choose. */
export function normaliseChoice(choice: PhotoChoice, photoCount: number, recipes: PhotoRecipeOption[]): PhotoChoice {
  const photo = choice.photo >= 0 && choice.photo < photoCount ? choice.photo : 0
  const recipe = recipes.some((r) => r.index === choice.recipe) ? choice.recipe : (recipes[0]?.index ?? 0)
  return { enabled: choice.enabled && photoCount > 0 && recipes.length > 0, photo, recipe }
}
/** The `photo` of the confirm call; undefined when the switch is off or there is nothing valid to send. */
export function confirmPhoto(choice: PhotoChoice, photoCount: number, recipes: PhotoRecipeOption[]): ConfirmPhoto | undefined {
  if (!choice.enabled) return undefined
  if (choice.photo < 0 || choice.photo >= photoCount) return undefined
  if (!recipes.some((r) => r.index === choice.recipe)) return undefined
  return { index: choice.photo, recipe: choice.recipe }
}
/** GET /api/imports/{id}/photos/{index}. */
export function photoUrl(importId: string, index: number): string {
  return `/api/imports/${encodeURIComponent(importId)}/photos/${index}`
}
