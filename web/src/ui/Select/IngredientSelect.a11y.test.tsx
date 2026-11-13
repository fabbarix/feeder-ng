import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { IngredientSelect } from './IngredientSelect'

// BR-D round 3: the two same-name options must sound different to a screen reader.
const list = [
  { id: 5, name: 'béchamel', baseUnit: 'ml' },
  { id: 30, name: 'Béchamel', baseUnit: 'ml', baseRecipe: { id: 3, name: 'Béchamel', archived: false } },
]

describe('IngredientSelect: the Base recipe badge is part of the option\'s accessible name or description', () => {
  it('names the Base recipe option "…Base recipe" and not the plain one', async () => {
    render(<IngredientSelect label="Ingredient" ingredients={list} value={null} onChange={() => {}} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Ingredient' }))
    const options = screen.getAllByRole('option')
    const describedAs = (o: HTMLElement) => `${o.getAttribute('aria-label') ?? ''} ${o.getAttribute('aria-describedby') ? document.getElementById(o.getAttribute('aria-describedby')!)?.textContent ?? '' : ''} ${o.textContent ?? ''}`
    const based = options.filter((o) => /Base recipe/.test(describedAs(o)))
    expect(based).toHaveLength(1)
    // not only visible text: the accessible name or description carries it
    const carries = (o: HTMLElement) => /Base recipe/.test(o.getAttribute('aria-label') ?? '') || /Base recipe/.test(document.getElementById(o.getAttribute('aria-describedby') ?? '')?.textContent ?? '')
    expect(carries(based[0]!)).toBe(true)
    expect(options.filter(carries)).toHaveLength(1)
  })
})
