// B9-31 (SAFE-10): removing a Step and giving it back, in lib/steps.ts and lib/stepUses.ts. Pure.
//
//   removeStepWithUndo(steps, index) -> { steps, removed: RemovedStep | null }     (null: index out of range, steps unchanged)
//   restoreStep(steps, removed)      -> steps    the Step at its index with its own `after`, and every other Step that waited for it
//                                                waits for it again ("After step N" references survive)
//   removeUseWithUndo(steps, stepIndex, useIndex) -> { steps, removed: RemovedUse | null }
//   restoreUse(steps, removed)       -> steps    the use back at its index in the Step it came from (found by the Step's key, so a Step
//                                                that moved meanwhile still gets it back)
import { describe, expect, it } from 'vitest'
import type { StepDraft } from './draft'
import { removeStepWithUndo, restoreStep } from './steps'
import { removeUseWithUndo, restoreUse } from './stepUses'

const step = (key: string, after: number[] = [], over: Partial<StepDraft> = {}): StepDraft => ({
  key, text: key, kind: 'active', durationMinutes: '5', leadTimeMinutes: '', after, uses: [], image: '', ...over,
})
const use = (key: string, ingredientId = 7) => ({ key, ingredientId, ingredientName: 'garlic', quantity: '2', unit: 'clove' })

describe('removeStepWithUndo / restoreStep', () => {
  it('removes the Step and reports it with its index', () => {
    const steps = [step('a'), step('b'), step('c')]
    const out = removeStepWithUndo(steps, 1)
    expect(out.steps.map((s) => s.key)).toEqual(['a', 'c'])
    expect(out.removed?.index).toBe(1)
    expect(out.removed?.step.key).toBe('b')
  })

  it('remove then restore gives the original Steps, "after" included', () => {
    const steps = [step('a'), step('b', [0]), step('c', [0, 1]), step('d', [2])]
    for (let i = 0; i < steps.length; i++) {
      const out = removeStepWithUndo(steps, i)
      expect(restoreStep(out.steps, out.removed!)).toEqual(steps)
    }
  })

  it('the Steps that waited for the removed one wait for it again, at the right numbers', () => {
    const steps = [step('a'), step('b', [0]), step('c', [1]), step('d', [0, 2])]
    const { steps: after, removed } = removeStepWithUndo(steps, 1)
    expect(after.map((s) => s.after)).toEqual([[], [], [0, 1]]) // c lost "after b"; d's 2 is now 1
    expect(restoreStep(after, removed!).map((s) => s.after)).toEqual([[], [0], [1], [0, 2]])
  })

  it('keeps the removed Step\'s text, kind, timing, uses and Photo', () => {
    const rich = step('b', [0], { text: 'Roast', kind: 'passive', durationMinutes: '40', uses: [use('u1')], image: 'img1' })
    const out = removeStepWithUndo([step('a'), rich], 1)
    expect(restoreStep(out.steps, out.removed!)[1]).toEqual(rich)
  })

  it('an out-of-range index removes nothing and reports null', () => {
    const steps = [step('a')]
    expect(removeStepWithUndo(steps, 3)).toEqual({ steps, removed: null })
  })

  it('does not mutate its input', () => {
    const steps = [step('a'), step('b', [0])]
    const before = JSON.stringify(steps)
    const out = removeStepWithUndo(steps, 0)
    restoreStep(out.steps, out.removed!)
    expect(JSON.stringify(steps)).toBe(before)
  })
})

describe('removeUseWithUndo / restoreUse', () => {
  const steps = (): StepDraft[] => [step('a'), step('b', [], { uses: [use('u1', 7), use('u2', 8), use('u3', 9)] })]

  it('removes the use and reports it with its Step and index', () => {
    const out = removeUseWithUndo(steps(), 1, 1)
    expect(out.steps[1]!.uses.map((u) => u.key)).toEqual(['u1', 'u3'])
    expect(out.removed).toMatchObject({ stepKey: 'b', index: 1, use: { key: 'u2' } })
  })

  it('remove then restore gives the original', () => {
    for (const j of [0, 1, 2]) {
      const out = removeUseWithUndo(steps(), 1, j)
      expect(restoreUse(out.steps, out.removed!)).toEqual(steps())
    }
  })

  it('finds the Step by its key after the Steps were reordered', () => {
    const out = removeUseWithUndo(steps(), 1, 0)
    const swapped = [out.steps[1]!, out.steps[0]!]
    const back = restoreUse(swapped, out.removed!)
    expect(back[0]!.uses.map((u) => u.key)).toEqual(['u1', 'u2', 'u3'])
  })

  it('a Step that is gone gives the use nowhere to go: the Steps come back unchanged', () => {
    const out = removeUseWithUndo(steps(), 1, 0)
    const without = out.steps.filter((s) => s.key !== 'b')
    expect(restoreUse(without, out.removed!)).toEqual(without)
  })

  it('an unknown index removes nothing and reports null', () => {
    const s = steps()
    expect(removeUseWithUndo(s, 1, 9)).toEqual({ steps: s, removed: null })
    expect(removeUseWithUndo(s, 5, 0)).toEqual({ steps: s, removed: null })
  })
})
