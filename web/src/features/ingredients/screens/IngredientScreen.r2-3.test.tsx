// R2-3 (F-05): Ingredient Base Unit. No native <fieldset>/<legend> frame, no duplicate "g" chip above the options. Unlocked: the
// Base Unit radiogroup of R14 (BaseUnitPicker: icons, tick, helper; it may become a Segmented once options take icons/describedBy).
// Locked (referenced): a read-only value "g" in the Keeping tile's Base Unit row with the hint "Used in N places, so it can't change" (B9-48, SET-05).
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderRoutes } from '../ingredient.test-helper'
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
  save: vi.fn().mockResolvedValue({}),
}
vi.mock('../hooks/useIngredient', () => ({ useIngredient: () => hook }))
vi.mock('../hooks/useIngredientImpact', () => ({ useIngredientImpact: () => ({ impact: { references: {}, total: 0 }, isLoading: false }) }))
vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../products', () => ({ IngredientProducts: () => <p>products tile</p> }))
vi.mock('../../recipes/components/IngredientExclusionList', () => ({ IngredientExclusionList: () => <p>exclusion list</p> }))
vi.mock('./../components/MergeSheet', () => ({ MergeSheet: () => null }))

import { IngredientScreen } from './IngredientScreen'

function setup() {
  return renderRoutes([{ path: '/ingredients/:id', element: <IngredientScreen /> }], '/ingredients/7')
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

  it('chooses the Base Unit in the draft while nothing uses the Ingredient; Save changes sends it (B9-48: one Save for Keeping)', async () => {
    setup()
    await userEvent.click(screen.getByRole('radio', { name: 'piece' }))
    expect(hook.setBaseUnit).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(hook.save).toHaveBeenCalledWith({ baseUnit: 'piece' })
  })

  it('locked: a read-only "Base Unit" value row, the helper, and no radiogroup', () => {
    hook.referenceCount = 3
    hook.ingredient = { ...base, references: { 'recipe lines': 3 } }
    setup()
    expect(screen.queryByRole('radiogroup')).toBeNull()
    const row = screen.getByTestId('base-unit-value')
    expect(row.textContent).toBe('g')
    expect(screen.getByText("Used in 3 places, so it can't change")).toBeInTheDocument()
    expect(screen.getAllByText(/^g$/)).toHaveLength(1)
  })

  it('Shelf Life shows the number only in its Stepper (no "3 days" text above it)', () => {
    setup()
    expect(screen.queryByText('3 days')).toBeNull()
    expect(screen.getByRole('spinbutton', { name: 'Shelf Life' })).toHaveTextContent('3')
  })
})
