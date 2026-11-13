import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IngredientSelect } from './IngredientSelect'

// BR-D: a Base recipe's Ingredient is an option with a "Base recipe" badge (Phosphor cooking-pot); a plain Ingredient of the same name is a second option.
const list = [
  { id: 1, name: 'milk', baseUnit: 'ml' },
  { id: 5, name: 'béchamel', baseUnit: 'ml' },
  { id: 30, name: 'Béchamel', baseUnit: 'ml', baseRecipe: { id: 3, name: 'Béchamel', archived: false } },
  { id: 31, name: 'Roux', baseUnit: 'g', baseRecipe: { id: 4, name: 'Roux', archived: false } },
]
const open = async (query = '', props: Partial<React.ComponentProps<typeof IngredientSelect>> = {}) => {
  render(<IngredientSelect label="Ingredient" ingredients={list} value={null} onChange={() => {}} {...props} />)
  await userEvent.click(screen.getByRole('combobox', { name: 'Ingredient' }))
  if (query) await userEvent.keyboard(query)
}

describe('IngredientSelect: Base recipe badge', () => {
  it('marks the Base recipe options with "Base recipe" and leaves plain Ingredients unmarked', async () => {
    await open()
    const options = screen.getAllByRole('option')
    const badged = options.filter((o) => o.textContent?.includes('Base recipe'))
    expect(badged).toHaveLength(2)
    expect(badged.map((o) => o.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Roux'), expect.stringContaining('Béchamel')]))
    expect(options.find((o) => o.textContent?.startsWith('milk'))?.textContent).not.toContain('Base recipe')
  })

  it('offers a plain Ingredient and a Base recipe of the same name as two options, told apart by the badge', async () => {
    await open('béchamel')
    const options = screen.getAllByRole('option').filter((o) => /béchamel/i.test(o.textContent ?? ''))
    expect(options).toHaveLength(2)
    expect(options.filter((o) => o.textContent?.includes('Base recipe'))).toHaveLength(1)
  })

  it('puts the Base recipe first on an exact name match (it is preferred)', async () => {
    await open('béchamel')
    const first = screen.getAllByRole('option')[0]
    expect(first).toHaveTextContent('Base recipe')
  })

  it('picking the Base recipe option reports its Ingredient id', async () => {
    const onChange = vi.fn()
    await open('roux', { onChange })
    await userEvent.click(screen.getByRole('option', { name: /Roux/ }))
    expect(onChange).toHaveBeenCalledWith(31)
  })

  it('does not offer to create an Ingredient named like a Base recipe\'s typed exactly as a plain one that exists', async () => {
    await open('Béchamel', { onCreate: vi.fn() })
    expect(screen.queryByRole('option', { name: /^Create Ingredient/ })).toBeNull()
  })
})
