import { describe, expect, it } from 'vitest'
import { todayStrings } from './strings'

describe('todayStrings', () => {
  it('says Planned Meals, never a bare "meals", in the empty state', () => {
    expect(todayStrings.emptyHint).toBe(
      'No Planned Meals to cook, no Leftovers waiting, nothing about to spoil. Put your feet up or plan something tasty.',
    )
  })
})
