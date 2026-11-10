import { describe, expect, it } from 'vitest'
import { whyIcon } from './whyIcon'

describe('whyIcon', () => {
  it.each([
    ['overlap', 'ingredientOverlap'],
    ['favourite', 'favourite'],
    ['useSoon', 'useSoon'],
    ['slotRule', 'slotRule'],
    ['inStock', 'alreadyInStock'],
  ] as const)('%s -> %s', (cause, icon) => {
    expect(whyIcon(cause)).toBe(icon)
  })
  it('falls back to the sparkle `why` icon', () => {
    expect(whyIcon()).toBe('why')
  })
})
