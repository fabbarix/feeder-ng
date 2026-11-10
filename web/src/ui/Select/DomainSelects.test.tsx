import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IngredientSelect } from './IngredientSelect'
import { MealSlotSelect } from './MealSlotSelect'
import { MemberSelect } from './MemberSelect'
import { RecipeSelect } from './RecipeSelect'
import { ShopSelect } from './ShopSelect'
import { UnitSelect } from './UnitSelect'

const open = (name: RegExp | string) => userEvent.click(screen.getByRole('combobox', { name }))
const optionNames = () => screen.getAllByRole('option').map((o) => o.textContent ?? '')

describe('RecipeSelect', () => {
  const recipes = [
    { id: 1, name: 'Zucchini bake', tags: ['vegetarian'], totalMinutes: 40, lastCookedAt: '2026-10-01' },
    { id: 2, name: 'Beef stew', tags: ['winter'], totalMinutes: 120, lastCookedAt: '2026-11-02' },
    { id: 3, name: 'Chickpea curry', tags: ['vegetarian', 'curry'], totalMinutes: 35, lastCookedAt: null },
  ]
  it('lists Recipes by name with minutes, and picks one', async () => {
    const onChange = vi.fn()
    render(<RecipeSelect label="Recipe" recipes={recipes} value={null} onChange={onChange} />)
    await open('Recipe')
    expect(optionNames()).toEqual(['Beef stew120 min', 'Chickpea curry35 min', 'Zucchini bake40 min'])
    await userEvent.click(screen.getByRole('option', { name: /Beef stew/ }))
    expect(onChange).toHaveBeenCalledWith(2)
  })
  it('offers a Tag filter chip per distinct Tag', async () => {
    render(<RecipeSelect label="Recipe" recipes={recipes} value={null} onChange={() => {}} />)
    await open('Recipe')
    await userEvent.click(screen.getByRole('button', { name: 'vegetarian' }))
    expect(optionNames().map((n) => n.slice(0, 7))).toEqual(['Chickpe', 'Zucchin'])
    expect(screen.getByRole('button', { name: 'curry' })).toBeInTheDocument()
  })
  it('sorts by name or by last cooked (most recent first, never-cooked last)', async () => {
    render(<RecipeSelect label="Recipe" recipes={recipes} value={null} onChange={() => {}} />)
    await open('Recipe')
    await userEvent.click(screen.getByRole('button', { name: 'Sort: Name' }))
    expect(screen.getByRole('button', { name: 'Sort: Last cooked' })).toBeInTheDocument()
    expect(optionNames().map((n) => n.slice(0, 4))).toEqual(['Beef', 'Zucc', 'Chic'])
  })
  it('says "No Recipe matches" for an empty search', async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: i + 10, name: `Recipe ${i}`, tags: [] }))
    render(<RecipeSelect label="Recipe" recipes={many} value={null} onChange={() => {}} />)
    await open('Recipe')
    await userEvent.keyboard('xyz')
    expect(screen.getByText("No Recipe matches 'xyz'")).toBeInTheDocument()
  })
})

describe('IngredientSelect', () => {
  const ingredients = [{ id: 1, name: 'Garlic', baseUnit: 'g' }, { id: 2, name: 'Milk', baseUnit: 'ml' }]
  it('shows the Base Unit meta and returns the id', async () => {
    const onChange = vi.fn()
    render(<IngredientSelect label="Ingredient" ingredients={ingredients} value={null} onChange={onChange} />)
    await open('Ingredient')
    expect(screen.getByRole('option', { name: /Garlic/ })).toHaveTextContent('Base Unit: g')
    await userEvent.click(screen.getByRole('option', { name: /Milk/ }))
    expect(onChange).toHaveBeenCalledWith(2)
  })
  it('accepts a not-yet-saved choice (no id, temporary key) and shows its Base Unit once', async () => {
    const onChange = vi.fn()
    const withNew = [...ingredients, { key: 'new-1', name: 'Saffron', baseUnit: 'g' }]
    render(<IngredientSelect label="Ingredient" ingredients={withNew} value="new-1" onChange={onChange} />)
    expect(screen.getByRole('combobox', { name: 'Ingredient' })).toHaveTextContent('Saffron')
    await open('Ingredient')
    const row = screen.getByRole('option', { name: /Saffron/ })
    expect(row.querySelector('.select__badge')).toBeNull() // meta only: no extra unit badge
    expect(row).toHaveTextContent('Base Unit: g')
    await userEvent.click(screen.getByRole('option', { name: /Milk/ }))
    expect(onChange).toHaveBeenCalledWith(2)
    await open('Ingredient')
    await userEvent.click(screen.getByRole('option', { name: /Saffron/ }))
    expect(onChange).toHaveBeenLastCalledWith('new-1')
  })
  it('creates from the typed query', async () => {
    const onCreate = vi.fn()
    const many = Array.from({ length: 9 }, (_, i) => ({ id: i + 10, name: `Thing ${i}`, baseUnit: 'g' }))
    render(<IngredientSelect label="Ingredient" ingredients={many} value={null} onChange={() => {}} onCreate={onCreate} />)
    await open('Ingredient')
    await userEvent.keyboard('saffron')
    await userEvent.click(screen.getByRole('option', { name: 'Create Ingredient "saffron"' }))
    expect(onCreate).toHaveBeenCalledWith('saffron')
  })
})

describe('UnitSelect', () => {
  it('groups Base Unit, Unit Conversions and Units and returns the unit string', async () => {
    const onChange = vi.fn()
    render(<UnitSelect label="Unit" units={{ baseUnit: 'g', conversions: [{ unit: 'clove', toBase: 5 }], globalUnits: ['g', 'ml'] }} value="g" onChange={onChange} />)
    await open('Unit')
    expect(screen.getAllByRole('group')).toHaveLength(3)
    expect(screen.getByRole('group', { name: 'Unit Conversions' })).toHaveTextContent('1 clove = 5 g')
    await userEvent.click(screen.getByRole('option', { name: /clove/ }))
    expect(onChange).toHaveBeenCalledWith('clove')
  })
})

describe('ShopSelect', () => {
  it('lists Shops in the given order', async () => {
    const onChange = vi.fn()
    render(<ShopSelect label="Shop" shops={[{ id: 2, name: 'Coop' }, { id: 1, name: 'Aldi' }]} value={1} onChange={onChange} />)
    expect(screen.getByRole('combobox', { name: /Shop/ })).toHaveTextContent('Aldi')
    await open('Shop')
    expect(optionNames()).toEqual(['Coop', 'Aldi'])
    await userEvent.click(screen.getByRole('option', { name: 'Coop' }))
    expect(onChange).toHaveBeenCalledWith(2)
  })
})

describe('MealSlotSelect', () => {
  it('groups Meal Slots by weekday with the time as meta', async () => {
    const onChange = vi.fn()
    render(
      <MealSlotSelect
        label="Meal Slot"
        slots={[{ id: 3, weekday: 2, name: 'Dinner', time: '19:30' }, { id: 1, weekday: 1, name: 'Dinner', time: '19:30' }]}
        value={null}
        onChange={onChange}
      />,
    )
    await open('Meal Slot')
    expect(screen.getByRole('group', { name: 'Monday' })).toHaveTextContent('Dinner')
    expect(screen.getByRole('group', { name: 'Tuesday' })).toHaveTextContent('19:30')
    await userEvent.click(within_(screen.getByRole('group', { name: 'Tuesday' })))
    expect(onChange).toHaveBeenCalledWith(3)
  })
})

function within_(group: HTMLElement): HTMLElement {
  return group.querySelector<HTMLElement>('[role=option]')!
}

describe('MemberSelect', () => {
  const members = [{ id: 1, name: 'Fabio' }, { id: 2, name: 'Lucia Maria Bernadette' }]
  it('is a multi select with avatars; reports the chosen ids', async () => {
    const onChange = vi.fn()
    render(<MemberSelect label="Members" members={members} values={[1]} onChange={onChange} />)
    expect(screen.getByRole('combobox', { name: /Members/ })).toHaveTextContent('Fabio')
    await open('Members')
    expect(screen.getAllByRole('img', { name: 'Lucia Maria Bernadette' })).not.toHaveLength(0)
    await userEvent.click(screen.getByRole('option', { name: /Lucia/ }))
    expect(onChange).toHaveBeenCalledWith([1, 2])
  })
})

describe('option accessible names', () => {
  it('names a Member option by its label only (the decorative Avatar is hidden)', async () => {
    render(<MemberSelect label="Members" members={[{ id: 1, name: 'Anna' }]} values={[]} onChange={() => {}} />)
    await open('Members')
    expect(screen.getByRole('option', { name: 'Anna' })).toBeInTheDocument()
  })
  it('names an Ingredient option by its label only and exposes the meta as the description', async () => {
    render(<IngredientSelect label="Ingredient" ingredients={[{ id: 1, name: 'eggs', baseUnit: 'piece' }]} value={null} onChange={() => {}} />)
    await open('Ingredient')
    const option = screen.getByRole('option', { name: 'eggs' })
    expect(option).toHaveAccessibleDescription('Base Unit: piece')
  })
})
