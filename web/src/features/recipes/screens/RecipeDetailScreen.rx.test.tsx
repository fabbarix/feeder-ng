// B9-27 on the Recipe detail screen: RX-04 (hero chip line), RX-05 (the lede), RX-07 (untimed Steps), RX-13 (Ready Meal moved), RX-14 (rows).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, Page, ToastProvider } from '../../../ui'
import { stubViewportWidth } from '../../../ui/lib/viewport.test-helper'
import { garlic, recipe } from '../fixtures.test-helper'
import { household } from '../household.test-helper'
import type { Recipe, RecipeStep } from '../types'

const h = vi.hoisted(() => ({ recipe: {} as Record<string, unknown>, household: {} as import('../hooks/useHouseholdPreferences').UseHouseholdPreferences, clamped: false }))
vi.mock('../hooks/useRecipe', () => ({ useRecipe: () => h.recipe }))
vi.mock('../hooks/useHouseholdPreferences', () => ({ useHouseholdPreferences: () => h.household }))
vi.mock('../hooks/useIngredientRefs', () => ({ useIngredientRefs: () => ({ byId: new Map([[7, garlic]]), isLoading: false }) }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../../ui/useIsClamped', () => ({ useIsClamped: () => h.clamped }))
vi.mock('../hooks/useRecipeTags', () => ({ useRecipeTags: () => ({ known: [], colourOf: () => undefined }) }))
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: [{ id: 1, name: 'Main', main: true }], isPending: false, isError: false }) }))

import { RecipeDetailScreen } from './RecipeDetailScreen'

const show = (over: Partial<Recipe> = {}) => {
  h.recipe = { recipe: recipe(over), isLoading: false, error: null, setArchived: vi.fn(), remove: vi.fn(), state: 'ready' }
  return render(
    <MemoryRouter initialEntries={['/recipes/3']}>
      <ToastProvider>
        <ConfirmProvider>
          <Routes>
            <Route path="/recipes/:id" element={<Page width="default"><RecipeDetailScreen /></Page>} />
          </Routes>
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}
const untimed = (text: string): RecipeStep => ({ text, kind: 'active', durationMinutes: 0, leadTimeMinutes: 0, after: [], uses: [], image: '' })

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  h.household = household()
  h.clamped = false
  stubViewportWidth(1440)
})
afterEach(() => vi.unstubAllGlobals())

describe('RX-05: the lede under the page header', () => {
  it('shows the description and the Source between the header and the two columns, full width, not in a Tile', () => {
    const { container } = show({ description: 'A quick weeknight tomato sauce.', source: { url: 'https://example.test/p', attribution: 'Nonna' } })
    const root = container.querySelector('.recipe-detail') as HTMLElement
    const lede = root.querySelector(':scope > .recipe-about') as HTMLElement
    expect(lede).not.toBeNull()
    expect(lede).toHaveTextContent('A quick weeknight tomato sauce.')
    expect(lede.querySelector('.recipe-source')).toHaveTextContent('Source: Nonna · example.test')
    const kids = Array.from(root.children)
    expect(kids.indexOf(lede)).toBeGreaterThan(kids.findIndex((e) => e.classList.contains('page-header')))
    expect(kids.indexOf(lede)).toBeLessThan(kids.findIndex((e) => e.classList.contains('recipe-detail__layout')))
    expect(lede.closest('.tile')).toBeNull()
  })
  it('opens the Source in a new tab', () => {
    show({ source: { url: 'https://example.test/p', attribution: '' } })
    const link = screen.getByRole('link', { name: 'Source: example.test, opens in a new tab' })
    expect(link).toHaveAttribute('target', '_blank')
  })
  it('has no lede for a Recipe with neither a description nor a Source', () => {
    const { container } = show({ description: '', source: { url: '', attribution: '' } })
    expect(container.querySelector('.recipe-about')).toBeNull()
  })
  it('offers Show more when the description is cut', async () => {
    h.clamped = true
    show({ description: 'x '.repeat(200) })
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('RX-04 / RX-13: the hero chip line', () => {
  it('puts the Ready Meal chip on the hero line with the Courses, never in a metric tile', () => {
    const { container } = show({ readyMeal: true })
    const line = within(container.querySelector('.recipe-detail__hero') as HTMLElement).getByRole('list', { name: 'Courses and Tags' })
    expect(within(line).getByText('Ready Meal')).toBeInTheDocument()
    expect(within(container.querySelector('.bento-grid[data-min="metric"]') as HTMLElement).queryByText('Ready Meal')).toBeNull()
  })
  it('puts Archived on the same line, and keeps the Cook entry for an archived Recipe', () => {
    show({ archived: true })
    expect(within(screen.getByRole('list', { name: 'Courses and Tags' })).getByText('Archived')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Cook' })).toBeInTheDocument()
  })
  it('leaves exactly one Courses-and-Tags list in the hero (not three lists)', () => {
    const { container } = show({ readyMeal: true, archived: true })
    const hero = container.querySelector('.recipe-detail__hero') as HTMLElement
    expect(hero.querySelectorAll('ul')).toHaveLength(1)
    expect(within(hero).queryByRole('list', { name: 'Courses' })).toBeNull()
    expect(within(hero).queryByRole('list', { name: 'Tags' })).toBeNull()
  })
})

describe('RX-04: the hero band', () => {
  it('is marked data-photo="false" without a Photo (the band is 4:1) and "true" with one', () => {
    const a = show({ imageUrl: '' })
    expect(a.container.querySelector('.recipe-detail__hero')).toHaveAttribute('data-photo', 'false')
    a.unmount()
    const b = show({ imageUrl: '/api/images/abc' })
    expect(b.container.querySelector('.recipe-detail__hero')).toHaveAttribute('data-photo', 'true')
  })
})

describe('RX-07: untimed Steps are not "No Steps" (the detail)', () => {
  it('a Recipe with two Steps and no time says "No time set" and "2 Steps, none timed", and its Steps say "No time"', () => {
    const { container } = show({ steps: [untimed('Chop'), untimed('Toss')], totalMinutes: 0, advanceMinutes: 0, advance: [] })
    const tiles = Array.from(container.querySelectorAll('.bento-grid[data-min="metric"] .tile-metric'))
    expect(tiles[1]).toHaveTextContent('No time set')
    expect(tiles[1]).toHaveTextContent('2 Steps, none timed')
    expect(screen.queryByText('No Steps')).toBeNull()
    expect(container.querySelectorAll('.steps-list__time[data-untimed="true"]')).toHaveLength(2)
  })
  it('a Recipe with no Steps still says "No Steps"', () => {
    show({ steps: [], totalMinutes: 0, advanceMinutes: 0, advance: [] })
    expect(screen.getByText('No Steps')).toBeInTheDocument()
    expect(screen.queryByText('No time set')).toBeNull()
  })
})

describe('RX-14: the Ingredient lines are rows with the ⋮ last', () => {
  it('shows the line as name, quantity, then the actions, and the detail under them', () => {
    const { container } = show({ lines: [{ ingredientId: 7, ingredient: 'garlic', quantity: 3, unit: 'clove', optional: true, note: 'crushed' }] })
    const row = container.querySelector('.ingredient-lines__row') as HTMLElement
    expect(row.querySelector('.ingredient-lines__detail')).toHaveTextContent('Optional · crushed')
    expect(row.firstElementChild).toHaveClass('ingredient-lines__name')
    expect(container.querySelector('.ingredient-lines')?.tagName).toBe('DL')
  })
})
