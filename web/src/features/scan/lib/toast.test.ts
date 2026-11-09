import { describe, expect, it } from 'vitest'
import { formatQuantity } from '../../../lib/units'
import { feedbackText } from './toast'

const base = { ingredientName: 'Passata', quantity: 700, baseUnit: 'g', priceCents: 159, currency: 'USD', onList: true } as const

describe('feedbackText', () => {
  it('shows the Ingredient, the quantity added and the price', () => {
    expect(feedbackText(base)).toBe('Passata +700 g · $1.59')
  })

  it('says when the item is not on the list', () => {
    expect(feedbackText({ ...base, onList: false })).toBe('Passata +700 g · $1.59 · not on the list')
  })

  it('leaves the price out when none is known', () => {
    expect(feedbackText({ ...base, priceCents: null })).toBe('Passata +700 g')
    expect(feedbackText({ ...base, priceCents: null, onList: false })).toBe('Passata +700 g · not on the list')
  })

  it('uses the household currency', () => {
    expect(feedbackText({ ...base, currency: 'EUR' })).toBe('Passata +700 g · €1.59')
  })

  it('formats volumes and pieces', () => {
    expect(feedbackText({ ...base, ingredientName: 'milk', quantity: 1000, baseUnit: 'ml', priceCents: null })).toBe('milk +1000 ml')
    expect(feedbackText({ ...base, ingredientName: 'eggs', quantity: 6, baseUnit: 'piece', priceCents: null })).toBe('eggs +6 pieces')
  })

  it('follows the display unit system', () => {
    expect(feedbackText(base, 'imperial')).toBe(`Passata +${formatQuantity(700, 'g', 'imperial')} · $1.59`)
  })
})
