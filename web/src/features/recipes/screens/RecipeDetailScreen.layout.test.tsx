// R2-1 (D-01, L-03, G-01): Recipe detail is one centred column below 1280 with the Cook entry in a StickyActionBar,
// and two columns from 1280 with the Cook entry in the left column.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, Page } from '../../../ui'
import { stubViewportWidth } from '../../../ui/lib/viewport.test-helper'
import { garlic, recipe } from '../fixtures.test-helper'

const h = vi.hoisted(() => ({ recipe: {} as Record<string, unknown>, prefs: {} as Record<string, unknown>, picker: {} as Record<string, unknown> }))
vi.mock('../hooks/useRecipe', () => ({ useRecipe: () => h.recipe }))
vi.mock('../hooks/useRecipePreferences', () => ({ useRecipePreferences: () => h.prefs }))
vi.mock('../hooks/useMemberPicker', () => ({ useMemberPicker: () => h.picker }))
vi.mock('../hooks/useIngredientRefs', () => ({ useIngredientRefs: () => ({ byId: new Map([[7, garlic]]), isLoading: false }) }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))

import { RecipeDetailScreen } from './RecipeDetailScreen'

const view = () =>
  render(
    <MemoryRouter initialEntries={['/recipes/3']}>
      <ConfirmProvider>
        <Routes>
          <Route
            path="/recipes/:id"
            element={
              <Page width="default">
                <RecipeDetailScreen />
              </Page>
            }
          />
          <Route path="*" element={<p>cooking</p>} />
        </Routes>
      </ConfirmProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  h.recipe = { recipe: recipe(), isLoading: false, error: null, setArchived: vi.fn(), remove: vi.fn() }
  h.prefs = { stateOf: () => 'none', isExcluded: () => false, toggleRecipe: vi.fn(), toggleIngredient: vi.fn(), noMember: false, isLoading: false }
  h.picker = { members: [{ id: 1, name: 'Anna' }], selectedId: 1, memberId: undefined, select: vi.fn(), isLoading: false }
})
afterEach(() => vi.unstubAllGlobals())

const heading = (name: string) => screen.getByRole('heading', { level: 2, name })

describe('Recipe detail at 1280 and up (D-01)', () => {
  it('has a layout with a left column (photo, metrics, Ingredients, Cook entry) and a main column (Steps, preferences)', () => {
    stubViewportWidth(1280)
    const { container } = view()
    const layout = container.querySelector('.recipe-detail__layout')!
    const aside = layout.querySelector(':scope > .recipe-detail__aside')!
    const main = layout.querySelector(':scope > .recipe-detail__main')!
    expect(aside).not.toBeNull()
    expect(main).not.toBeNull()
    expect(aside.querySelector('.recipe-detail__hero')).not.toBeNull()
    expect(aside).toContainElement(screen.getByText('4 portions per Batch'))
    expect(aside).toContainElement(heading('Ingredients'))
    expect(aside).toContainElement(screen.getByRole('button', { name: 'Start Cook Mode' }))
    expect(aside).toContainElement(screen.getByRole('spinbutton', { name: 'Batches' }))
    expect(main).toContainElement(heading('Steps'))
    expect(main).toContainElement(heading('Your preferences'))
  })
  it('has no StickyActionBar: the Cook entry is inline in the left column', () => {
    stubViewportWidth(1280)
    const { container } = view()
    expect(container.querySelector('.sticky-action-bar')).toBeNull()
    expect(container.querySelector('.recipe-detail__aside .cook-entry')).not.toBeNull()
  })
})

describe('Recipe detail below 1280 (L-03)', () => {
  it('puts the Cook entry in a StickyActionBar named "Cook", in the Page body, outside the detail layout', () => {
    stubViewportWidth(1279)
    const { container } = view()
    const bar = screen.getByRole('group', { name: 'Cook' })
    expect(bar).toHaveClass('sticky-action-bar')
    expect(bar).toHaveAttribute('data-column', 'page')
    expect(within(bar).getByRole('button', { name: 'Start Cook Mode' })).toBeInTheDocument()
    expect(within(bar).getByRole('spinbutton', { name: 'Batches' })).toBeInTheDocument()
    expect(bar.closest('.page__body')).not.toBeNull()
    expect(bar.closest('.recipe-detail__layout')).toBeNull()
    expect(container.querySelectorAll('.cook-entry')).toHaveLength(1)
  })
  it('reads in order: photo, metrics, Ingredients, Steps, preferences (one column)', () => {
    stubViewportWidth(390)
    view()
    const order = [heading('Ingredients'), heading('Steps'), heading('Your preferences')]
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })
  it('starts Cook Mode from the bar', async () => {
    stubViewportWidth(390)
    view()
    await userEvent.click(within(screen.getByRole('group', { name: 'Cook' })).getByRole('button', { name: 'Start Cook Mode' }))
    expect(screen.getByText('cooking')).toBeInTheDocument() // navigated to /cook/recipe/3
  })
})

describe('More actions (G-01)', () => {
  it('is a Menu with Archive and Delete as menuitems, not a sheet', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    const menu = screen.getByRole('menu', { name: 'More actions' })
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Archive', 'Delete'])
    expect(within(menu).getByRole('menuitem', { name: 'Delete' })).toHaveAttribute('data-tone', 'danger')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('on a phone it is the "More" sheet with the same two rows', async () => {
    stubViewportWidth(390)
    view()
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    const sheet = screen.getByRole('dialog', { name: 'More' })
    expect(within(sheet).getByRole('button', { name: 'Archive' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })
  it('an archived Recipe offers Unarchive', async () => {
    h.recipe = { ...h.recipe, recipe: recipe({ archived: true }) }
    view()
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menuitem', { name: 'Unarchive' })).toBeInTheDocument()
  })
})

describe('no width of its own (L-02)', () => {
  it('adds no second page container and no inline width', () => {
    const { container } = view()
    expect(container.querySelectorAll('[data-page-width]')).toHaveLength(1)
    expect(container.querySelector('[style*="max-width"], [style*="max-inline-size"]')).toBeNull()
  })
})
