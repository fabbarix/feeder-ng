// CRS F: the note on a Swap row (spec 7.3): Whole meal cover, then the relaxed chip, then the first why chip.
import { describe, expect, it } from 'vitest'
import { alternativeNote } from './choose'
import type { Alternative } from '../types'

const ctx = { slotDate: '2026-11-10' }
const alt = (over: Partial<Alternative> = {}): Alternative => ({
  recipeId: 5, recipeName: 'Lasagne', batches: 1, newLeftoverPortions: 0, newLeftoverUseBy: '', score: 1, why: [], ...over,
})

describe('alternativeNote', () => {
  it('a Whole meal that covers a Course says "Whole meal: no Side"', () => {
    expect(alternativeNote(alt({ wholeMeal: true, covers: ['Side'], why: [{ code: 'favourite', members: ['Anna'] }] }), ctx)).toBe('Whole meal: no Side')
  })

  it('names every covered Course', () => {
    expect(alternativeNote(alt({ wholeMeal: true, covers: ['Side', 'Dessert'] }), ctx)).toBe('Whole meal: no Side, no Dessert')
  })

  it('a Whole meal that covers nothing (a one-Course slot) is an ordinary alternative', () => {
    expect(alternativeNote(alt({ wholeMeal: true, covers: [], why: [{ code: 'favourite', members: ['Anna'] }] }), ctx)).toBe("Anna's favourite")
  })

  it('a relaxed alternative shows its relaxed chip', () => {
    const why = [{ code: 'cooldown_relaxed' as const, date: '2026-11-08', recipeId: 5 }]
    expect(alternativeNote(alt({ relaxed: true, why }), ctx)).toBe('Again soon: had Sun')
  })

  it('a strict alternative shows its first phrased why chip; nothing to say is undefined', () => {
    expect(alternativeNote(alt({ why: [{ code: 'favourite', members: ['Anna'] }] }), ctx)).toBe("Anna's favourite")
    expect(alternativeNote(alt(), ctx)).toBeUndefined()
  })
})
