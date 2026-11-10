// Editing a Step's `uses` (Ingredient + quantity + unit) and photo in the Steps editor (G2). Pure; returns new arrays.
import type { StepDraft, UseDraft } from './draft'

/** A blank use: no Ingredient, empty quantity and unit. */
export function newUseDraft(): UseDraft {
  throw new Error('not implemented')
}

/** Appends a blank use to the Step at `step`. Other Steps are the same objects. */
export function addUse(steps: StepDraft[], step: number): StepDraft[] {
  void steps
  void step
  throw new Error('not implemented')
}

/** Patches use `use` of Step `step`. Picking an Ingredient is `{ ingredientId, ingredientName, unit: baseUnit }` built by the caller. */
export function updateUse(steps: StepDraft[], step: number, use: number, patch: Partial<UseDraft>): StepDraft[] {
  void steps
  void step
  void use
  void patch
  throw new Error('not implemented')
}

/** Removes use `use` of Step `step`; the others keep their order. */
export function removeUse(steps: StepDraft[], step: number, use: number): StepDraft[] {
  void steps
  void step
  void use
  throw new Error('not implemented')
}

/** Sets (or, with '', clears) the photo id of Step `step`. */
export function setStepImage(steps: StepDraft[], step: number, image: string): StepDraft[] {
  void steps
  void step
  void image
  throw new Error('not implemented')
}
