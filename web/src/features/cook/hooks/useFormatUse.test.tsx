import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UnitSystem } from '../../../lib/units'
import type { IngredientRef } from '../../recipes/types'
import type { StepUse } from '../types'

const state = vi.hoisted(() => ({ system: 'metric' as UnitSystem, byId: new Map<number, unknown>() }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => state.system }))
vi.mock('../../recipes/hooks/useIngredientRefs', () => ({ useIngredientRefs: () => ({ byId: state.byId, isLoading: false }) }))

import { useFormatUse } from './useFormatUse'

const flour: IngredientRef = { id: 3, name: 'flour', baseUnit: 'g', conversions: [] }
const onion: IngredientRef = { id: 1, name: 'onion', baseUnit: 'piece', conversions: [] }
const use = (over: Partial<StepUse>): StepUse => ({ ingredientId: 3, ingredient: 'flour', quantity: 250, unit: 'g', ...over })

function format(system: UnitSystem, u: StepUse): string {
  state.system = system
  state.byId = new Map<number, unknown>([[3, flour], [1, onion]])
  return renderHook(() => useFormatUse()).result.current(u)
}

describe('useFormatUse', () => {
  it('imperial: 250 g of flour reads 8.8 oz', () => {
    expect(format('imperial', use({}))).toBe('8.8 oz flour')
  })

  it('imperial: converts a global unit through the Base Unit (1 kg is 2 lb 3 oz)', () => {
    expect(format('imperial', use({ quantity: 1, unit: 'kg' }))).toBe('2 lb 3 oz flour')
  })

  it('metric: shows the use in the Base Unit as typed', () => {
    expect(format('metric', use({}))).toBe('250 g flour')
  })

  it('pieces stay pieces in imperial too', () => {
    expect(format('imperial', use({ ingredientId: 1, ingredient: 'onion', quantity: 4, unit: 'piece' }))).toBe('4 pieces onion')
  })

  it('an Ingredient that is not loaded yet shows the use as typed', () => {
    state.system = 'imperial'
    state.byId = new Map()
    expect(renderHook(() => useFormatUse()).result.current(use({}))).toBe('250 g flour')
  })
})
