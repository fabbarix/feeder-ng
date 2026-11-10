import { describe, expect, it } from 'vitest'
import { tagIcon } from './tagIcon'

describe('tagIcon (docs/design/ui-fix-plan.md 4.15)', () => {
  it.each([
    ['pasta', 'pasta'],
    ['fish', 'fish'],
    ['chicken', 'chicken'],
    ['pizza', 'pizza'],
    ['soup', 'soup'],
    ['vegetarian', 'vegetarian'],
  ])('maps %s to the %s icon', (tag, icon) => {
    expect(tagIcon(tag)).toBe(icon)
  })

  it('matches case-insensitively and ignores surrounding spaces', () => {
    expect(tagIcon('Pasta')).toBe('pasta')
    expect(tagIcon('  PIZZA ')).toBe('pizza')
  })

  it.each(['dessert', 'quick', '', '   ', 'pastas'])('falls back to other for %j', (tag) => {
    expect(tagIcon(tag)).toBe('other')
  })

  it('falls back to other when there is no Tag', () => {
    expect(tagIcon(undefined)).toBe('other')
  })
})
