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
  throw new Error('TODO(ra-e developer): not implemented')
}
/** The Recipes that can get the photo: all except those whose effective action is skip. */
export function photoRecipes(plan: Plan | undefined, decisions: Decisions): PhotoRecipeOption[] {
  void plan
  void decisions
  throw new Error('TODO(ra-e developer): not implemented')
}
/** Keeps the choice valid: photo within 0..count-1, recipe within the options (else the first); switch off when there is nothing to choose. */
export function normaliseChoice(choice: PhotoChoice, photoCount: number, recipes: PhotoRecipeOption[]): PhotoChoice {
  void choice
  void photoCount
  void recipes
  throw new Error('TODO(ra-e developer): not implemented')
}
/** The `photo` of the confirm call; undefined when the switch is off or there is nothing valid to send. */
export function confirmPhoto(choice: PhotoChoice, photoCount: number, recipes: PhotoRecipeOption[]): ConfirmPhoto | undefined {
  void choice
  void photoCount
  void recipes
  throw new Error('TODO(ra-e developer): not implemented')
}
/** GET /api/imports/{id}/photos/{index}. */
export function photoUrl(importId: string, index: number): string {
  void importId
  void index
  throw new Error('TODO(ra-e developer): not implemented')
}
