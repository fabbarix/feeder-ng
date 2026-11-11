import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IngredientSelect } from './IngredientSelect'

// R14: "Create Ingredient '<typed name>'" as the last option of the shared Ingredient picker.
const few = [
  { id: 1, name: 'Garlic', baseUnit: 'g' },
  { id: 2, name: 'Garlic salt', baseUnit: 'g' },
  { id: 3, name: 'Crème fraîche', baseUnit: 'g' },
]

async function typeInto(query: string, props: Partial<React.ComponentProps<typeof IngredientSelect>> = {}) {
  const onCreate = vi.fn()
  render(<IngredientSelect label="Ingredient" ingredients={few} value={null} onChange={() => {}} onCreate={onCreate} {...props} />)
  await userEvent.click(screen.getByRole('combobox', { name: 'Ingredient' }))
  if (query !== '') await userEvent.keyboard(query)
  return onCreate
}

describe('IngredientSelect create option', () => {
  it('is the last option, after the matches, even for a short list', async () => {
    await typeInto('garlic s')
    const options = screen.getAllByRole('option')
    expect(options.at(-1)).toHaveAccessibleName('Create Ingredient "garlic s"')
    expect(options.length).toBeGreaterThan(1)
  })
  it('appears when the search finds only partial matches', async () => {
    await typeInto('garl')
    expect(screen.getByRole('option', { name: 'Create Ingredient "garl"' })).toBeInTheDocument()
  })
  it.each(['garlic', '  GARLIC ', 'Garlic', 'creme fraiche', 'CRÈME   FRAÎCHE'])('is absent when "%s" already is an Ingredient', async (query) => {
    await typeInto(query)
    expect(screen.queryByRole('option', { name: /^Create Ingredient/ })).toBeNull()
  })
  it('is absent for an empty query', async () => {
    await typeInto('')
    expect(screen.queryByRole('option', { name: /^Create Ingredient/ })).toBeNull()
  })
  it('keeps no create row on a picker without onCreate', async () => {
    render(<IngredientSelect label="Ingredient" ingredients={few} value={null} onChange={() => {}} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Ingredient' }))
    await userEvent.keyboard('saffron')
    expect(screen.queryByRole('option', { name: /^Create Ingredient/ })).toBeNull()
  })
  it('passes the trimmed typed name to onCreate and is reachable from the keyboard (End, Enter)', async () => {
    const onCreate = await typeInto('  saffron ')
    await userEvent.keyboard('{End}{Enter}')
    expect(onCreate).toHaveBeenCalledWith('saffron')
  })
  it('given a reason, shows the row disabled with the reason and does nothing when chosen (offline)', async () => {
    const onCreate = await typeInto('saffron', { createDisabledReason: 'Needs a connection to create an Ingredient' })
    const row = screen.getByRole('option', { name: /Create Ingredient "saffron"/ })
    expect(row).toHaveAttribute('aria-disabled', 'true')
    expect(row).toHaveTextContent('Needs a connection to create an Ingredient')
    await userEvent.click(row)
    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox', { name: 'Ingredient' })).toBeInTheDocument()
  })
})
