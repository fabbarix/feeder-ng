import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { IngredientSelect } from './IngredientSelect'

// BR-D round 4: an option is described by its badge AND its meta (the Base recipe badge and "Base Unit: ml"), in that order.
const list = [
  { id: 5, name: 'béchamel', baseUnit: 'ml' },
  { id: 30, name: 'Béchamel', baseUnit: 'ml', baseRecipe: { id: 3, name: 'Béchamel', archived: false } },
]
const open = async () => {
  render(<IngredientSelect label="Ingredient" ingredients={list} value={null} onChange={() => {}} />)
  await userEvent.click(screen.getByRole('combobox', { name: 'Ingredient' }))
  return screen.getAllByRole('option')
}
const described = (o: HTMLElement) => (o.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)

describe('Select options: aria-describedby', () => {
  it('lists the badge id and then the meta id for an option that has both', async () => {
    const options = await open()
    const based = options.find((o) => /Base recipe/.test(o.textContent ?? ''))!
    const ids = described(based)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toMatch(/-badge$/)
    expect(ids[1]).toMatch(/-meta$/)
    expect(document.getElementById(ids[0]!)).toHaveTextContent('Base recipe')
    expect(document.getElementById(ids[1]!)?.textContent).toMatch(/ml/)
  })

  it('an option with a meta and no badge is described by the meta alone', async () => {
    const options = await open()
    const plainOption = options.find((o) => !/Base recipe/.test(o.textContent ?? ''))!
    const ids = described(plainOption)
    expect(ids).toHaveLength(1)
    expect(ids[0]).toMatch(/-meta$/)
  })

  it('every id it lists exists in the document', async () => {
    for (const o of await open()) for (const id of described(o)) expect(document.getElementById(id), id).not.toBeNull()
  })
})
