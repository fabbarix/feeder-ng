// B9-28 (RX-01): the result page. It names the Recipes, links to each and to its editor, and lists what else was added.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { applied, confirmed } from '../fixtures.baseRecipes.test-helper'
import { match, plan, preview, prompt, recipe } from '../fixtures.test-helper'
import type { ImportResult as Result, Plan } from '../types'
import { ImportResult } from './ImportResult'

const result: Result = confirmed(
  [applied({ index: 0, id: 11, name: 'Chicken tikka traybake' }), applied({ index: 1, id: 12, name: 'Lasagne (ready meal)', action: 'replaced' })],
  { ingredientsCreated: 3, conversionsAdded: 1 },
)
const thePlan: Plan = plan({
  recipes: [
    recipe({ index: 0, name: 'Chicken tikka traybake' }),
    recipe({ index: 1, name: 'Lasagne (ready meal)', status: 'conflict', resolved: true, action: 'replace', preview: preview({ readyMeal: true, yield: 2, lines: [], steps: [] }) }),
  ],
  ingredients: [match({ key: 'chicken thighs', name: 'chicken thighs' }), match({ key: 'basmati rice', name: 'basmati rice' }), match({ key: 'greek yogurt', name: 'greek yogurt' })],
  unitPrompts: [prompt({ key: 'garam masala', ingredient: 'garam masala', unit: 'tbsp', base: 'g', answered: true, toBase: 6 })],
})
const show = (over: Partial<Parameters<typeof ImportResult>[0]> = {}) => {
  const onImportMore = vi.fn()
  const view = render(
    <MemoryRouter>
      <ImportResult result={result} plan={thePlan} onImportMore={onImportMore} {...over} />
    </MemoryRouter>,
  )
  return { onImportMore, ...view }
}

describe('ImportResult', () => {
  it('names how many Recipes were imported in a heading that takes focus', () => {
    show()
    const heading = screen.getByRole('heading', { name: 'Imported 2 Recipes' })
    expect(heading).toHaveFocus()
    expect(heading).toHaveAttribute('tabindex', '-1')
  })
  it('puts a success CheckCircle beside the heading (a page, not a toast)', () => {
    show()
    const heading = screen.getByRole('heading', { name: 'Imported 2 Recipes' })
    expect(heading.parentElement?.querySelector('svg')).not.toBeNull()
  })
  it('has one row per imported Recipe: its name, what happened to it and its detail', () => {
    show()
    const tikka = screen.getByRole('link', { name: /^Chicken tikka traybake/ })
    expect(tikka).toHaveAttribute('href', '/recipes/11')
    expect(within(tikka.closest('li')!).getByText('Created')).toBeInTheDocument()
    expect(within(tikka.closest('li')!).getByText('Main · 4 portions · 2 Steps')).toBeInTheDocument()
    const lasagne = screen.getByRole('link', { name: /^Lasagne \(ready meal\)/ })
    expect(lasagne).toHaveAttribute('href', '/recipes/12')
    expect(within(lasagne.closest('li')!).getByText('Replaced')).toBeInTheDocument()
    expect(within(lasagne.closest('li')!).getByText('Ready Meal · 2 portions')).toBeInTheDocument()
  })
  it('gives each row a trailing outlined "Edit <name>" button that opens the editor, and no chevron', () => {
    const { container } = show()
    const edit = screen.getByRole('link', { name: 'Edit Chicken tikka traybake' })
    expect(edit).toHaveAttribute('href', '/recipes/11/edit')
    expect(screen.getByRole('link', { name: 'Edit Lasagne (ready meal)' })).toHaveAttribute('href', '/recipes/12/edit')
    expect(container.querySelector('.list-row__chevron')).toBeNull()
  })
  it('says "Now a Base recipe" and "Kept as ..." in the state', () => {
    show({
      result: confirmed([applied({ id: 13, name: 'Béchamel', action: 'converted' }), applied({ index: 1, id: 14, name: 'Soup (2)' })]),
      plan: plan({ recipes: [recipe({ name: 'Béchamel' }), recipe({ index: 1, name: 'Soup', status: 'conflict', resolved: true, action: 'keep_both', importedAs: 'Soup (2)' })] }),
    })
    expect(screen.getByText('Now a Base recipe')).toBeInTheDocument()
    expect(screen.getByText('Kept as Soup (2)')).toBeInTheDocument()
    // the key is the file's name (as in the review); the new name is said once, in the state, and the links go to the new Recipe
    const soup = screen.getByRole('link', { name: /^Soup/ })
    expect(soup).toHaveAttribute('href', '/recipes/14')
    expect(soup.closest('li')!.querySelector('.list-row__title')).toHaveTextContent(/^Soup$/)
    expect(screen.getByRole('link', { name: 'Edit Soup (2)' })).toHaveAttribute('href', '/recipes/14/edit')
  })
  it('lists what else was added as rows: Ingredients created and Unit Conversions added, with names', () => {
    show()
    expect(screen.getByText('Also added')).toBeInTheDocument()
    const ingredients = screen.getByText('Ingredients created').closest('li') as HTMLElement
    expect(within(ingredients).getByText('3')).toBeInTheDocument()
    expect(within(ingredients).getByText('Chicken thighs, Basmati rice, Greek yogurt')).toBeInTheDocument()
    const conversions = screen.getByText('Unit Conversions added').closest('li') as HTMLElement
    expect(within(conversions).getByText('1')).toBeInTheDocument()
    expect(within(conversions).getByText('Garam masala: 1 tbsp = 6 g')).toBeInTheDocument()
  })
  it('has no Also added section when nothing else was added', () => {
    show({ result: confirmed([applied({ id: 11, name: 'Chicken tikka traybake' })]), plan: plan({ recipes: [recipe()] }) })
    expect(screen.queryByText('Also added')).not.toBeInTheDocument()
  })
  it('ends with two outlined secondary actions: "Import more" and "Open Recipes"; neither is primary', async () => {
    const { onImportMore } = show()
    const more = screen.getByRole('button', { name: 'Import more' })
    expect(more).toHaveAttribute('data-variant', 'secondary')
    const open = screen.getByRole('link', { name: 'Open Recipes' })
    expect(open).toHaveAttribute('href', '/recipes')
    expect(open).toHaveAttribute('data-variant', 'secondary')
    await userEvent.click(more)
    expect(onImportMore).toHaveBeenCalledOnce()
  })
  it('names the one Recipe in the singular', () => {
    show({ result: confirmed([applied({ id: 11, name: 'Chicken tikka traybake' })]), plan: plan({ recipes: [recipe()] }) })
    expect(screen.getByRole('heading', { name: 'Imported 1 Recipe' })).toBeInTheDocument()
  })
})
