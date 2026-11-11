// R2-3 (F-05): Ingredient Base Unit. No native <fieldset>/<legend> frame, no duplicate "g" chip above the options. Unlocked: the
// Base Unit radiogroup of R14 (BaseUnitPicker: icons, tick, helper; it may become a Segmented once options take icons/describedBy).
// Locked (referenced): a read-only value row "Base Unit . g" with the helper "Used in N places, so the Base Unit can't change".
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { strings } from '../strings'
import type { IngredientDetail } from '../types'

const base: IngredientDetail = { id: 7, name: 'garlic', baseUnit: 'g', shelfLifeDays: 3, conversions: [{ unit: 'clove', toBase: 5 }], references: {} }
const hook = {
  ingredient: base as IngredientDetail | undefined,
  isLoading: false,
  error: null as Error | null,
  referenceCount: 0,
  rename: vi.fn().mockResolvedValue({}),
  setBaseUnit: vi.fn().mockResolvedValue({}),
  setShelfLife: vi.fn().mockResolvedValue({}),
  setConversion: vi.fn().mockResolvedValue({}),
  removeConversion: vi.fn().mockResolvedValue({}),
  remove: vi.fn().mockResolvedValue(undefined),
}
vi.mock('../hooks/useIngredient', () => ({ useIngredient: () => hook }))
vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../products', () => ({ IngredientProducts: () => <p>products tile</p> }))
vi.mock('./../components/MergeSheet', () => ({ MergeSheet: () => null }))

import { IngredientScreen } from './IngredientScreen'

function setup() {
  const router = createMemoryRouter([{ path: '/ingredients/:id', element: <IngredientScreen /> }], { initialEntries: ['/ingredients/7'] })
  return render(<RouterProvider router={router} />)
}

describe('IngredientScreen Base Unit (F-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hook.ingredient = base
    hook.referenceCount = 0
  })

  it('renders no native fieldset or legend anywhere on the screen', () => {
    const { container } = setup()
    expect(container.querySelector('fieldset, legend')).toBeNull()
  })

  it('is a radiogroup named "Base Unit" with g, ml and piece; g is checked', () => {
    setup()
    const group = screen.getByRole('radiogroup', { name: strings.baseUnitLabel })
    expect(within(group).getAllByRole('radio').map((r) => r.textContent?.trim())).toEqual(['g', 'ml', 'piece'])
    expect(within(group).getByRole('radio', { name: 'g' })).toBeChecked()
  })

  it('prints the current Base Unit once: no separate "g" chip above the options', () => {
    setup()
    expect(screen.getAllByText(/^g$/)).toHaveLength(1)
  })

  it('explains what the Base Unit decides (the radiogroup is described by a helper)', () => {
    setup()
    const group = screen.getByRole('radiogroup', { name: strings.baseUnitLabel })
    expect(group).toHaveAccessibleDescription(strings.sheet.baseUnitHelper)
  })

  it('changes the Base Unit while nothing uses the Ingredient', async () => {
    setup()
    await userEvent.click(screen.getByRole('radio', { name: 'piece' }))
    expect(hook.setBaseUnit).toHaveBeenCalledWith('piece')
  })

  it('locked: a read-only "Base Unit" value row, the helper, and no radiogroup', () => {
    hook.referenceCount = 3
    hook.ingredient = { ...base, references: { 'recipe lines': 3 } }
    setup()
    expect(screen.queryByRole('radiogroup')).toBeNull()
    const row = screen.getByTestId('base-unit-value')
    expect(row).toHaveTextContent(strings.baseUnitLabel)
    expect(row).toHaveTextContent('g')
    expect(screen.getByText(strings.baseUnitLocked(3))).toBeInTheDocument()
    expect(screen.getAllByText(/^g$/)).toHaveLength(1)
  })

  it('Shelf Life shows the number only in its field (no "3 days" text above it)', () => {
    setup()
    expect(screen.queryByText('3 days')).toBeNull()
    expect(screen.getByRole('spinbutton', { name: 'Shelf Life' })).toHaveValue('3')
  })
})
