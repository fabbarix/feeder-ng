// R11a N5: the closed Meal Slot combobox says which weekday's slot is chosen ("Tue · Dinner"), the open list keeps its
// weekday groups with the plain slot names.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MealSlotSelect } from './MealSlotSelect'
import { mealSlotOptions } from './options'

const slots = [
  { id: 1, weekday: 1, name: 'Dinner', time: '19:30' },
  { id: 3, weekday: 2, name: 'Dinner', time: '19:30' },
]

describe('MealSlotSelect closed trigger', () => {
  it('shows the weekday with the slot name', () => {
    render(<MealSlotSelect label="Meal Slot" slots={slots} value={3} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: /Meal Slot/ })).toHaveTextContent('Tue · Dinner')
  })

  it('tells two Dinners apart', () => {
    const { rerender } = render(<MealSlotSelect label="Meal Slot" slots={slots} value={1} onChange={() => {}} />)
    expect(screen.getByRole('combobox')).toHaveTextContent('Mon · Dinner')
    rerender(<MealSlotSelect label="Meal Slot" slots={slots} value={3} onChange={() => {}} />)
    expect(screen.getByRole('combobox')).toHaveTextContent('Tue · Dinner')
  })

  it('uses the first three letters of localised weekday names', () => {
    const names = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
    render(<MealSlotSelect label="Meal Slot" slots={slots} value={3} onChange={() => {}} weekdayNames={names} />)
    expect(screen.getByRole('combobox')).toHaveTextContent('Mar · Dinner')
  })
})

describe('mealSlotOptions', () => {
  it('keeps label = name and group = weekday, and adds triggerLabel = "<Day> · <name>"', () => {
    const opts = mealSlotOptions(slots)
    expect(opts.map((o) => [o.group, o.label, o.triggerLabel])).toEqual([
      ['Monday', 'Dinner', 'Mon · Dinner'],
      ['Tuesday', 'Dinner', 'Tue · Dinner'],
    ])
  })
})
