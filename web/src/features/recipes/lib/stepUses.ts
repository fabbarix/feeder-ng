// Editing a Step's `uses` (Ingredient + quantity + unit) and photo in the Steps editor (G2). Pure; returns new arrays.
import { newKey, type StepDraft, type UseDraft } from './draft'

/** A blank use: no Ingredient, empty quantity and unit. */
export function newUseDraft(): UseDraft {
  return { key: newKey('use'), ingredientId: null, ingredientName: '', quantity: '', unit: '' }
}

/** Maps only the Step at `step`; the other Steps stay the same objects. */
function onStep(steps: StepDraft[], step: number, change: (s: StepDraft) => StepDraft): StepDraft[] {
  return steps.map((s, i) => (i === step ? change(s) : s))
}

/** Appends a blank use to the Step at `step`. Other Steps are the same objects. */
export function addUse(steps: StepDraft[], step: number): StepDraft[] {
  return onStep(steps, step, (s) => ({ ...s, uses: [...s.uses, newUseDraft()] }))
}

/** Patches use `use` of Step `step`. Picking an Ingredient is `{ ingredientId, ingredientName, unit: baseUnit }` built by the caller. */
export function updateUse(steps: StepDraft[], step: number, use: number, patch: Partial<UseDraft>): StepDraft[] {
  return onStep(steps, step, (s) => ({ ...s, uses: s.uses.map((u, j) => (j === use ? { ...u, ...patch } : u)) }))
}

/** Removes use `use` of Step `step`; the others keep their order. */
export function removeUse(steps: StepDraft[], step: number, use: number): StepDraft[] {
  return onStep(steps, step, (s) => ({ ...s, uses: s.uses.filter((_, j) => j !== use) }))
}

/** Sets (or, with '', clears) the photo id of Step `step`. */
export function setStepImage(steps: StepDraft[], step: number, image: string): StepDraft[] {
  return onStep(steps, step, (s) => ({ ...s, image }))
}
