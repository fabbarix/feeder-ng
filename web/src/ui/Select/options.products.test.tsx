// B9-30 (SET-01): productOptions(products, shop), the pure option builder of the Product Select (ui/Select/options.tsx).
//   ProductChoice = { id, name, ingredientName?, packLabel?, supply?, imageUrl?, shopIds?: number[] }
//   productOptions(products, shop?: { id, name }) -> SelectOption<number>[]
//     value = id; label = name; meta = "<Ingredient> · <pack size>", or "Supply · <pack size>" for a Supply (the caller formats packLabel);
//     leading = a Thumb (a monogram without a Picture); group = "Sold at <Shop>" for a Product sold there, "Other Products" for the rest.
//     Groups only when at least one Product is sold at the Shop and at least one is not; otherwise no group at all.
//     "Sold at <Shop>" comes first, each group keeps the order the caller gave, and every Product is kept (13 in, 13 out).
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { productOptions, type ProductChoice } from './options'

const coop = { id: 1, name: 'Coop' }
const p = (id: number, name: string, over: Partial<ProductChoice> = {}): ProductChoice => ({ id, name, ingredientName: 'Tomato passata', packLabel: '700 g', ...over })

describe('productOptions', () => {
  it('keeps every Product: 13 in, 13 out (the old sheet offered the first 12)', () => {
    const many = Array.from({ length: 13 }, (_, i) => p(i + 1, `Product ${i + 1}`))
    const options = productOptions(many, coop)
    expect(options).toHaveLength(13)
    expect(options.map((o) => o.value)).toEqual(many.map((m) => m.id))
  })

  it('groups "Sold at Coop" first and "Other Products" after it, each in the order given', () => {
    const options = productOptions([p(1, 'Zucchini'), p(2, 'Apple jam', { shopIds: [1] }), p(3, 'Mutti passata', { shopIds: [1, 2] }), p(4, 'Basil')], coop)
    expect(options.map((o) => [o.label, o.group])).toEqual([
      ['Apple jam', 'Sold at Coop'],
      ['Mutti passata', 'Sold at Coop'],
      ['Zucchini', 'Other Products'],
      ['Basil', 'Other Products'],
    ])
  })

  it('has no group when nothing is sold at the Shop, when everything is, or when no Shop is given', () => {
    const none = productOptions([p(1, 'A'), p(2, 'B')], coop)
    expect(none.every((o) => o.group === undefined)).toBe(true)
    const all = productOptions([p(1, 'A', { shopIds: [1] }), p(2, 'B', { shopIds: [1] })], coop)
    expect(all.every((o) => o.group === undefined)).toBe(true)
    const noShop = productOptions([p(1, 'A', { shopIds: [1] }), p(2, 'B')])
    expect(noShop.every((o) => o.group === undefined)).toBe(true)
  })

  it('the meta is "<Ingredient> · <pack size>", and "Supply · <pack size>" for a Supply', () => {
    const [food, supply] = productOptions([p(1, 'Mutti passata'), p(2, 'Dishwasher tablets', { supply: true, ingredientName: 'Dishwasher tablets', packLabel: '40 pieces' })])
    expect(food!.meta).toBe('Tomato passata · 700 g')
    expect(supply!.meta).toBe('Supply · 40 pieces')
  })

  it('the meta drops what it does not have, never printing "undefined"', () => {
    const [bare] = productOptions([{ id: 1, name: 'Bare' }])
    expect(bare!.meta ?? '').not.toContain('undefined')
    expect(productOptions([{ id: 1, name: 'No pack', ingredientName: 'Salt' }])[0]!.meta).toBe('Salt')
  })

  it('searches by name, Ingredient and pack size', () => {
    const [o] = productOptions([p(1, 'Mutti passata')])
    const haystack = (o!.searchText ?? [o!.label, o!.meta, ...(o!.keywords ?? [])].join(' ')).toLowerCase()
    expect(haystack).toContain('mutti')
    expect(haystack).toContain('tomato passata')
    expect(haystack).toContain('700 g')
  })

  it('draws a Thumb with the Picture, or the monogram without one', () => {
    const [withPicture, without] = productOptions([p(1, 'Mutti passata', { imageUrl: '/api/images/' + 'a'.repeat(32) }), p(2, 'Flour')])
    const a = render(<div>{withPicture!.leading}</div>).container
    expect(a.querySelector('img')).toHaveAttribute('src', '/api/images/' + 'a'.repeat(32))
    const b = render(<div>{without!.leading}</div>).container
    expect(b.querySelector('img')).toBeNull()
    expect(b).toHaveTextContent('F')
  })
})
