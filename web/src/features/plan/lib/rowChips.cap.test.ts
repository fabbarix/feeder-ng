// ds-plan round 2: a row shows at most 2 chips (in rowChips order); the rest collapse into one neutral "+N" chip whose title and
// accessible name list the hidden chips. The cap lives in lib, not in the component.
import { describe, expect, it } from 'vitest'
import { capChips, ROW_CHIP_LIMIT, type RowChip } from './rowChips'

const chip = (label: string): RowChip => ({ key: `k:${label}`, kind: 'why', label })
const labels = (cs: RowChip[]) => cs.map((c) => c.label)

describe('capChips', () => {
  it('the limit is 2', () => {
    expect(ROW_CHIP_LIMIT).toBe(2)
  })

  it('nothing, one or two chips: all shown, no "+N"', () => {
    expect(capChips([])).toEqual({ shown: [], more: null })
    expect(capChips([chip('A')]).more).toBeNull()
    const two = capChips([chip('A'), chip('B')])
    expect(labels(two.shown)).toEqual(['A', 'B'])
    expect(two.more).toBeNull()
  })

  it('three chips: the first two in order, and "+1" naming the third', () => {
    const r = capChips([chip('Leftover from Mon'), chip('Leftover for Fri'), chip("Mia's favourite")])
    expect(labels(r.shown)).toEqual(['Leftover from Mon', 'Leftover for Fri'])
    expect(r.more).toEqual({ label: '+1', title: "Mia's favourite", count: 1 })
  })

  it('five chips: "+3", the hidden labels joined by ", " in their order', () => {
    const r = capChips(['A', 'B', 'C', 'D', 'E'].map(chip))
    expect(labels(r.shown)).toEqual(['A', 'B'])
    expect(r.more).toEqual({ label: '+3', title: 'C, D, E', count: 3 })
  })

  it('takes another limit, and never changes its input', () => {
    const input = ['A', 'B', 'C', 'D'].map(chip)
    const copy = [...input]
    expect(labels(capChips(input, 3).shown)).toEqual(['A', 'B', 'C'])
    expect(capChips(input, 3).more?.label).toBe('+1')
    expect(input).toEqual(copy)
  })
})
