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

/** B9-31 (SAFE-10): a removed use, the key of its Step and its index there. */
export interface RemovedUse {
  stepKey: string
  index: number
  use: UseDraft
}

/** Removes use `useIndex` of Step `stepIndex` and reports it for an Undo; an unknown index removes nothing (removed: null). */
export function removeUseWithUndo(steps: StepDraft[], stepIndex: number, useIndex: number): { steps: StepDraft[]; removed: RemovedUse | null } {
  const use = steps[stepIndex]?.uses[useIndex]
  if (!use) return { steps, removed: null }
  return { steps: removeUse(steps, stepIndex, useIndex), removed: { stepKey: steps[stepIndex]!.key, index: useIndex, use } }
}

/** Gives a removed use back to its Step (found by key, so a moved Step still gets it), at its index (clamped). A Step that is gone: no change. */
export function restoreUse(steps: StepDraft[], removed: RemovedUse): StepDraft[] {
  if (!steps.some((s) => s.key === removed.stepKey)) return steps
  return steps.map((s) => {
    if (s.key !== removed.stepKey) return s
    const uses = [...s.uses]
    uses.splice(Math.max(0, Math.min(removed.index, uses.length)), 0, removed.use)
    return { ...s, uses }
  })
}
