import { describe, expect, it } from 'vitest'
import { isChromeless } from './chromeless'

describe('isChromeless', () => {
  it.each(['/board', '/board/', '/cook/meal/2026-11-09/3', '/cook/reheat/2026-11-10/2', '/cook/recipe/12', '/cook', '/board?x=1', '/cook/recipe/12#top'])('%s hides the bars', (p) => {
    expect(isChromeless(p)).toBe(true)
  })
  it.each(['/', '/plan', '/recipes', '/recipes/12', '/boards', '/cooking', '/settings/board', '/stock'])('%s keeps the bars', (p) => {
    expect(isChromeless(p)).toBe(false)
  })
})
