// RX-10 (decision RX 4; B9-37, was RecipeDetailsFields.baseRecipe.test.tsx): the Recipe's kind is one Segmented "Kind": Recipe, Ready
// Meal, Base recipe (the Base recipe switch and the Ready Meal checkbox are gone). It reports the choice; the screen applies it with
// lib/baseRecipe.setKind and asks on Save for a saved Recipe (KindChange). What a Base recipe hides is in RecipePlanningFields and
// RecipeYieldField tests.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { EditorKind } from '../lib/baseRecipe'
import { RecipeEditorKind } from './RecipeEditorKind'

const view = (value: EditorKind = 'recipe') => {
  const onChange = vi.fn()
  render(<RecipeEditorKind value={value} onChange={onChange} />)
  return onChange
}

describe('RecipeEditorKind', () => {
  it('is a radiogroup "Kind" of Recipe, Ready Meal and Base recipe, with its footnote', () => {
    view()
    const group = screen.getByRole('radiogroup', { name: 'Kind' })
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Recipe', 'Ready Meal', 'Base recipe'])
    expect(within(group).getByRole('radio', { name: 'Recipe' })).toHaveAttribute('aria-checked', 'true')
    expect(group).toHaveAccessibleDescription('A Ready Meal is one bought pack. A Base recipe is used inside other Recipes and never planned.')
  })
  it('shows a Base recipe as on, and reports turning it off', async () => {
    const onChange = view('base')
    expect(screen.getByRole('radio', { name: 'Base recipe' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('radio', { name: 'Recipe' }))
    expect(onChange).toHaveBeenCalledWith('recipe')
  })
  it('reports the choice and patches nothing itself; arrows move it (roving radios)', async () => {
    const onChange = view('recipe')
    await userEvent.click(screen.getByRole('radio', { name: 'Ready Meal' }))
    expect(onChange).toHaveBeenLastCalledWith('readyMeal')
    screen.getByRole('radio', { name: 'Recipe' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('readyMeal')
  })
  it('the old controls are gone: no switch, no checkbox', () => {
    view()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})
