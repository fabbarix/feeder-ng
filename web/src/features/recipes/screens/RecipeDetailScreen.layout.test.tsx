// R2-1 (D-01, L-03, G-01): Recipe detail is one centred column below 1280 with the Cook entry in a StickyActionBar,
// and two columns from 1280 with the Cook entry in the left column.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, Page } from '../../../ui'
import { stubViewportWidth } from '../../../ui/lib/viewport.test-helper'
import { garlic, recipe } from '../fixtures.test-helper'
import { household } from '../household.test-helper'

const h = vi.hoisted(() => ({ recipe: {} as Record<string, unknown>, household: {} as import('../hooks/useHouseholdPreferences').UseHouseholdPreferences }))
vi.mock('../hooks/useRecipe', () => ({ useRecipe: () => h.recipe }))
vi.mock('../hooks/useHouseholdPreferences', () => ({ useHouseholdPreferences: () => h.household }))
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
  h.household = household()
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
    expect(main).toContainElement(heading('Preferences'))
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
    const order = [heading('Ingredients'), heading('Steps'), heading('Preferences')]
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

describe('Preferences table on a phone (PT)', () => {
  it('sits in the Preferences Tile after Steps, as a table with a column per state', () => {
    stubViewportWidth(360)
    view()
    const tile = heading('Preferences').closest('section') as HTMLElement
    const table = within(tile).getByRole('table', { name: 'Preferences for Roast tray' })
    expect(within(table).getAllByRole('columnheader').map((c) => c.textContent?.trim())).toEqual(['Member', 'Favourite', 'Dislike', 'Exclusion'])
    expect(heading('Steps').compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('puts no width, overflow or scroll container of its own on the table or the Tile', () => {
    stubViewportWidth(360)
    const { container } = view()
    const table = screen.getByRole('table')
    expect(table.closest('[style]')).toBeNull()
    expect(container.querySelector('.preference-table-scroll, [style*="overflow"]')).toBeNull()
  })
  it('keeps every state button at least a 44 px target through the shared IconButton', () => {
    stubViewportWidth(360)
    view()
    for (const b of screen.getAllByRole('button', { name: /^(Anna|Ben): / })) {
      expect(b).toHaveClass('icon-button')
      expect(b).toHaveAttribute('data-size', 'md')
    }
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

// CRS E2: the screen reads the household Courses; these tests do not care which.
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: [], isPending: false, isError: false }) }))
