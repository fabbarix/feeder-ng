import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ingredientOptions, memberOptions, mealSlotOptions, recipeOptions, shopOptions, unitOptions } from './options'

describe('recipeOptions', () => {
  it('maps name, minutes meta and tags as search keywords', () => {
    const [opt] = recipeOptions([{ id: 7, name: 'Chicken tikka traybake', tags: ['curry', 'family'], totalMinutes: 35 }])
    expect(opt).toMatchObject({ value: 7, label: 'Chicken tikka traybake', meta: '35 min', keywords: ['curry', 'family'] })
    expect(opt?.leading).toBeTruthy()
  })
  it('has no meta without a duration', () => {
    expect(recipeOptions([{ id: 1, name: 'Soup', tags: [] }])[0]?.meta).toBeUndefined()
  })
})

describe('ingredientOptions', () => {
  it('shows the Base Unit as a badge and as meta', () => {
    const [opt] = ingredientOptions([{ id: 3, name: 'Garlic', baseUnit: 'g' }])
    expect(opt).toMatchObject({ value: 3, label: 'Garlic', meta: 'Base Unit: g' })
    render(<>{opt?.leading}</>)
    expect(screen.getByText('g')).toBeInTheDocument()
  })
})

describe('unitOptions', () => {
  const opts = unitOptions({ baseUnit: 'g', conversions: [{ unit: 'clove', toBase: 5 }], globalUnits: ['g', 'ml', 'clove', 'tsp'] })
  it('groups Base Unit, Unit Conversions, then global Units', () => {
    expect(opts.map((x) => [x.group, x.value])).toEqual([
      ['Base Unit', 'g'],
      ['Unit Conversions', 'clove'],
      ['Units', 'ml'],
      ['Units', 'tsp'],
    ])
  })
  it('explains a conversion in the meta and never repeats a unit', () => {
    expect(opts.find((x) => x.value === 'clove')?.meta).toBe('1 clove = 5 g')
    expect(opts.filter((x) => x.value === 'g')).toHaveLength(1)
  })
})

describe('shopOptions', () => {
  it('keeps the input order and gives each a leading icon', () => {
    const opts = shopOptions([{ id: 2, name: 'Coop' }, { id: 1, name: 'Aldi' }])
    expect(opts.map((x) => x.label)).toEqual(['Coop', 'Aldi'])
    expect(opts[0]?.leading).toBeTruthy()
  })
})

describe('mealSlotOptions', () => {
  const slots = [
    { id: 3, weekday: 2, name: 'Dinner', time: '19:30' },
    { id: 1, weekday: 1, name: 'Dinner', time: '19:30' },
    { id: 2, weekday: 1, name: 'Breakfast', time: '07:30' },
  ]
  it('groups by weekday name, ordered by weekday then time', () => {
    const opts = mealSlotOptions(slots)
    expect(opts.map((x) => [x.group, x.label, x.meta, x.value])).toEqual([
      ['Monday', 'Breakfast', '07:30', 2],
      ['Monday', 'Dinner', '19:30', 1],
      ['Tuesday', 'Dinner', '19:30', 3],
    ])
  })
  it('accepts localised weekday names', () => {
    const names = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
    expect(mealSlotOptions(slots, names)[0]?.group).toBe('Lunedì')
  })
})

describe('memberOptions', () => {
  it('uses the name and an Avatar', () => {
    const [opt] = memberOptions([{ id: 1, name: 'Lucia Maria Bernadette' }])
    expect(opt).toMatchObject({ value: 1, label: 'Lucia Maria Bernadette' })
    render(<>{opt?.leading}</>)
    expect(screen.getByRole('img', { name: 'Lucia Maria Bernadette' })).toBeInTheDocument()
  })
})
