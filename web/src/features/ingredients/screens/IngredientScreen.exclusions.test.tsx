// PT: the Ingredient page's Exclusions Tile (docs/dev/design/rx-pt.md section 5.4): who excludes this Ingredient, one toggle per Member.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { household, prefs } from '../../recipes/household.test-helper'
import type { IngredientDetail } from '../types'

const base: IngredientDetail = { id: 7, name: 'garlic', baseUnit: 'g', shelfLifeDays: 30, conversions: [], references: {} }
const h = vi.hoisted(() => ({ household: {} as import('../../recipes/hooks/useHouseholdPreferences').UseHouseholdPreferences }))
const hook = { ingredient: base as IngredientDetail | undefined, isLoading: false, error: null as Error | null, referenceCount: 0 }
vi.mock('../hooks/useIngredient', () => ({ useIngredient: () => hook }))
vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../products', () => ({ IngredientProducts: () => <p>products tile</p> }))
vi.mock('../../recipes/hooks/useHouseholdPreferences', () => ({ useHouseholdPreferences: () => h.household }))

import { IngredientScreen } from './IngredientScreen'

const setup = (entry = '/ingredients/7') => {
  const router = createMemoryRouter([{ path: '/ingredients/:id', element: <IngredientScreen /> }], { initialEntries: [entry] })
  return render(<RouterProvider router={router} />)
}
const tile = () => screen.getByRole('heading', { level: 2, name: 'Exclusions' }).closest('section') as HTMLElement

beforeEach(() => {
  hook.ingredient = base
  h.household = household({ prefsByMember: { 1: prefs(1), 2: prefs(2, { excludedIngredients: [7] }) } })
})

describe('IngredientScreen: Exclusions Tile', () => {
  it('has a Tile headed Exclusions, with the anchor #exclusions that Review Exclusions links to', () => {
    const { container } = setup()
    expect(tile()).toHaveAttribute('id', 'exclusions')
    expect(container.querySelector('#exclusions')).toBe(tile())
    expect(screen.getByRole('region', { name: 'Exclusions' })).toBe(tile())
  })
  it('lists every Member with a toggle "Sam excludes garlic", pressed for those who exclude it', () => {
    setup()
    expect(within(tile()).getAllByRole('listitem')).toHaveLength(2)
    expect(within(tile()).getByRole('button', { name: 'Anna excludes garlic' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(tile()).getByRole('button', { name: 'Ben excludes garlic' })).toHaveAttribute('aria-pressed', 'true')
  })
  // A11Y 3: the tile says in one line who excludes the Ingredient, and the row of each excluding Member says "Excludes garlic".
  it('says under its title who excludes the Ingredient', () => {
    setup()
    expect(within(tile()).getByText('Ben excludes garlic.')).toBeInTheDocument()
  })
  it('says "Nobody excludes garlic." when no Member does', () => {
    h.household = household({ prefsByMember: { 1: prefs(1), 2: prefs(2) } })
    setup()
    expect(within(tile()).getByText('Nobody excludes garlic.')).toBeInTheDocument()
  })
  it('puts "Excludes garlic" in the meta of each excluding Member\'s row, and on no other row', () => {
    setup()
    const [anna, ben] = within(tile()).getAllByRole('listitem')
    expect(within(ben!).getByText('Excludes garlic')).toBeInTheDocument()
    expect(within(anna!).queryByText('Excludes garlic')).toBeNull()
  })
  it('uses the Ingredient\'s own name in the toggles', () => {
    hook.ingredient = { ...base, id: 8, name: 'flour' }
    setup('/ingredients/8')
    expect(within(tile()).getByRole('button', { name: 'Anna excludes flour' })).toBeInTheDocument()
  })
  it('toggles for that Member and this Ingredient', async () => {
    setup()
    await userEvent.click(within(tile()).getByRole('button', { name: 'Anna excludes garlic' }))
    expect(h.household.toggleIngredient).toHaveBeenCalledWith(1, 7)
  })
  it('follows the Household as the hook reports it (a live event changes the pressed state)', () => {
    const { unmount } = setup()
    unmount()
    h.household = household({ prefsByMember: { 1: prefs(1, { excludedIngredients: [7] }), 2: prefs(2) } })
    setup()
    expect(within(tile()).getByRole('button', { name: 'Anna excludes garlic' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(tile()).getByRole('button', { name: 'Ben excludes garlic' })).toHaveAttribute('aria-pressed', 'false')
  })
  it('shows an ErrorState inside the Tile, with a retry that refetches, when the Household failed to load', async () => {
    h.household = household({ isError: true, members: [], prefsByMember: {} })
    setup()
    expect(within(tile()).getByRole('alert')).toBeInTheDocument()
    expect(within(tile()).queryByText('No Members yet')).toBeNull()
    await userEvent.click(within(tile()).getByRole('button', { name: 'Try again' }))
    expect(h.household.refetch).toHaveBeenCalledOnce()
  })
})

describe('IngredientScreen: imports the list from its file', () => {
  const sources = import.meta.glob(['../screens/IngredientScreen.tsx', '../../recipes/index.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  it('imports components/IngredientExclusionList directly, not from the recipes route module', () => {
    const screenSource = Object.entries(sources).find(([k]) => k.endsWith('IngredientScreen.tsx'))![1]
    expect(screenSource).toMatch(/from '\.\.\/\.\.\/recipes\/components\/IngredientExclusionList'/)
    expect(screenSource).not.toMatch(/from '\.\.\/\.\.\/recipes'/)
    expect(screenSource).not.toMatch(/from '\.\.\/\.\.\/recipes\/index'/)
  })
  it('does not export the list from features/recipes/index.ts', () => {
    const indexSource = Object.entries(sources).find(([k]) => k.endsWith('recipes/index.ts'))![1]
    expect(indexSource).not.toMatch(/IngredientExclusionList/)
  })
})
