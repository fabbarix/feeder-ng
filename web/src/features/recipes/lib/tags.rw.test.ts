// TG-RW: the tile's "first two Tags then +N" and the detail's link to the filtered list (docs/dev/design/tg-rw.md 3).
import { describe, expect, it } from 'vitest'
import { recipesTagPath, visibleTags } from './tags'

describe('visibleTags', () => {
  it.each([
    [[], 2, [], 0],
    [['a'], 2, ['a'], 0],
    [['a', 'b'], 2, ['a', 'b'], 0],
    [['a', 'b', 'c'], 2, ['a', 'b'], 1],
    [['a', 'b', 'c', 'd', 'e'], 2, ['a', 'b'], 3],
  ])('%j with limit %i shows %j and %i more', (tags, limit, shown, more) => {
    expect(visibleTags(tags as string[], limit as number)).toEqual({ shown, more })
  })
  it('keeps the Recipe order, not name order', () => {
    expect(visibleTags(['zucchini', 'apple', 'mango'], 2).shown).toEqual(['zucchini', 'apple'])
  })
})

describe('recipesTagPath', () => {
  it('puts the Tag name in the tag query', () => {
    expect(recipesTagPath('roast')).toBe('/recipes?tag=roast')
  })
  it('encodes spaces, accents and reserved characters', () => {
    expect(recipesTagPath('Purée & co')).toBe('/recipes?tag=Pur%C3%A9e%20%26%20co')
  })
})
