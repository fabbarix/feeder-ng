import { describe, expect, it } from 'vitest'
import { canonicalTag, suggestTags } from './tags'

const known = [
  { name: 'pasta', recipes: 12 },
  { name: 'pasta bake', recipes: 3 },
  { name: 'quick pasta', recipes: 5 },
  { name: 'roast', recipes: 9 },
  { name: 'Roasted veg', recipes: 2 },
]

describe('suggestTags', () => {
  it('lists the Tags containing what is typed, those starting with it first, then by use', () => {
    expect(suggestTags(known, [], 'pas').map((t) => t.name)).toEqual(['pasta', 'pasta bake', 'quick pasta'])
    expect(suggestTags(known, [], 'ROAST').map((t) => t.name)).toEqual(['roast', 'Roasted veg'])
  })
  it('leaves out Tags the Recipe already has (by key), and offers nothing while blank', () => {
    expect(suggestTags(known, ['Pasta'], 'pas').map((t) => t.name)).toEqual(['pasta bake', 'quick pasta'])
    expect(suggestTags(known, [], '   ')).toEqual([])
  })
  it('caps the list', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `tag ${i}`, recipes: i }))
    expect(suggestTags(many, [], 'tag')).toHaveLength(8)
  })
})

describe('canonicalTag', () => {
  it('reuses an existing Tag spelled differently, so no duplicate is made', () => {
    expect(canonicalTag(known, '  PASTA ')).toBe('pasta')
    expect(canonicalTag(known, 'roasted   VEG')).toBe('Roasted veg')
  })
  it('keeps a new Tag as typed', () => {
    expect(canonicalTag(known, 'Vegan')).toBe('Vegan')
  })
})
