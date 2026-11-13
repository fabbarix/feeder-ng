// Round 2: "From the freezer" does not offer a frozen Leftover that is past its Use-by (it is to answer, and the server refuses it).
import { describe, expect, it } from 'vitest'
import { frozenChilli } from './fixtures'
import { freezerChoices } from './rows'

describe('freezerChoices', () => {
  it('leaves out a frozen Leftover that is to answer', () => {
    const choices = freezerChoices([frozenChilli({ id: 5 }), frozenChilli({ id: 6, recipeName: 'Stew', useBy: '2026-11-10', toAnswer: true })])
    expect(choices.map((c) => c.leftoverId)).toEqual([5])
  })
  it('still offers one on its last Use-by day', () => {
    expect(freezerChoices([frozenChilli({ id: 5, useBy: '2026-11-12', toAnswer: false })])).toHaveLength(1)
  })
})
