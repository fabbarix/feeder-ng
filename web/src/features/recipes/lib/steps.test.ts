import { describe, expect, it } from 'vitest'
import { afterOptions, changeKind, insertStep, moveStep, newStepDraft, removeStep, toggleAfter, type Ordered } from './steps'

const s = (kind: Ordered['kind'], after: number[] = [], label = ''): Ordered & { label: string } => ({ kind, after, label })

// 0 marinate (advance), 1 oven, 2 veg, 3 roast after 1,2, 4 rice, 5 serve after 3,4
const spec = () => [
  s('advance', [], 'marinate'),
  s('active', [], 'oven'),
  s('active', [], 'veg'),
  s('passive', [1, 2], 'roast'),
  s('passive', [], 'rice'),
  s('active', [3, 4], 'serve'),
]
const afters = (steps: Ordered[]) => steps.map((x) => x.after)
const labels = (steps: { label: string }[]) => steps.map((x) => x.label)

describe('removeStep', () => {
  it('drops dependencies on the removed Step and shifts later ones down', () => {
    const out = removeStep(spec(), 1) // remove oven
    expect(labels(out)).toEqual(['marinate', 'veg', 'roast', 'rice', 'serve'])
    expect(afters(out)).toEqual([[], [], [1], [], [2, 3]]) // roast: was [1,2] -> [veg=1]; serve [3,4] -> [2,3]
  })

  it('does not mutate its input', () => {
    const input = spec()
    removeStep(input, 2)
    expect(afters(input)).toEqual(afters(spec()))
  })
})

describe('insertStep', () => {
  it('shifts dependencies at or past the insertion point', () => {
    const out = insertStep(spec(), 2, s('active', [], 'new')) // before veg
    expect(labels(out)).toEqual(['marinate', 'oven', 'new', 'veg', 'roast', 'rice', 'serve'])
    expect(afters(out)).toEqual([[], [], [], [], [1, 3], [], [4, 5]])
  })

  it('appends at the end without touching dependencies', () => {
    const out = insertStep(spec(), 6, s('active', [5], 'wash up'))
    expect(afters(out).slice(0, 6)).toEqual(afters(spec()))
    expect(out[6]!.after).toEqual([5])
  })
})

describe('moveStep', () => {
  it('keeps dependencies pointing at the same Steps when the order stays valid', () => {
    const out = moveStep(spec(), 2, 1) // veg before oven
    expect(labels(out)).toEqual(['marinate', 'veg', 'oven', 'roast', 'rice', 'serve'])
    expect(afters(out)).toEqual([[], [], [], [1, 2], [], [3, 4]])
  })

  it('drops a dependency that would now point at a later Step', () => {
    const out = moveStep(spec(), 3, 1) // roast before oven and veg: it can no longer wait for them
    expect(labels(out)).toEqual(['marinate', 'roast', 'oven', 'veg', 'rice', 'serve'])
    expect(out[1]!.after).toEqual([])
    expect(out[5]!.after).toEqual([1, 4]) // serve still waits for roast (now 1) and rice (now 4)
  })

  it('moving to the same place changes nothing', () => {
    expect(afters(moveStep(spec(), 4, 4))).toEqual(afters(spec()))
  })
})

describe('changeKind', () => {
  it('turning a Step into an Advance Step clears its dependencies and removes it from others', () => {
    const out = changeKind(spec(), 1, 'advance') // oven becomes advance; roast waited for it
    expect(out[1]!.kind).toBe('advance')
    expect(out[3]!.after).toEqual([2])
    const withAfter = spec()
    withAfter[5] = s('active', [4], 'serve')
    expect(changeKind(withAfter, 5, 'advance')[5]!.after).toEqual([])
  })

  it('other kind changes keep dependencies', () => {
    const out = changeKind(spec(), 3, 'active')
    expect(out[3]!.after).toEqual([1, 2])
  })
})

describe('afterOptions', () => {
  it('offers earlier non-advance Steps only', () => {
    expect(afterOptions(spec(), 3)).toEqual([1, 2])
    expect(afterOptions(spec(), 5)).toEqual([1, 2, 3, 4])
    expect(afterOptions(spec(), 1)).toEqual([])
  })

  it('offers nothing for an Advance Step', () => {
    expect(afterOptions(spec(), 0)).toEqual([])
    const steps = spec()
    steps[4] = s('advance', [], 'rice')
    expect(afterOptions(steps, 5)).toEqual([1, 2, 3])
  })
})

describe('newStepDraft', () => {
  it('is a blank Active Step with a fresh key each time', () => {
    const a = newStepDraft()
    const b = newStepDraft()
    expect(a).toMatchObject({ text: '', kind: 'active', durationMinutes: '', leadTimeMinutes: '', after: [], uses: [], image: '' })
    expect(a.key).not.toBe(b.key)
    expect(a.after).not.toBe(b.after)
  })
})

describe('toggleAfter', () => {
  it('adds a dependency keeping the list sorted', () => {
    const steps = [s('active'), s('active'), s('active'), s('passive', [2])]
    expect(toggleAfter(steps, 3, 0, true)[3]!.after).toEqual([0, 2])
    expect(toggleAfter(steps, 3, 1, true)[3]!.after).toEqual([1, 2])
  })

  it('does not duplicate an existing dependency', () => {
    const steps = [s('active'), s('active'), s('passive', [0, 1])]
    expect(toggleAfter(steps, 2, 1, true)[2]!.after).toEqual([0, 1])
  })

  it('removes a dependency when switched off, and ignores one that is absent', () => {
    const steps = [s('active'), s('active'), s('passive', [0, 1])]
    expect(toggleAfter(steps, 2, 0, false)[2]!.after).toEqual([1])
    expect(toggleAfter(steps, 2, 5, false)[2]!.after).toEqual([0, 1])
  })

  it('does not mutate and leaves other Steps as the same objects', () => {
    const steps = [s('active'), s('active'), s('passive', [0])]
    const out = toggleAfter(steps, 2, 1, true)
    expect(steps[2]!.after).toEqual([0])
    expect(out[0]).toBe(steps[0])
    expect(out[1]).toBe(steps[1])
    expect(out[2]).not.toBe(steps[2])
  })
})
