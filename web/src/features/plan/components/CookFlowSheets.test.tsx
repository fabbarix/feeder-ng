import { render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CookFlow } from '../hooks/useCookFlow'
import { useUsedFrom } from '../hooks/useUsedFrom'
import type { CookPreviewWithLots } from '../api.usedFrom'
import { INERT_CORRECTION } from '../../stock/hooks/useStockCorrection'
import { meal, noUsedFrom } from '../test-utils'
import { CookFlowSheets } from './CookFlowSheets'

function flow(over: Partial<CookFlow> = {}): CookFlow {
  return {
    cookKey: null, open: vi.fn(), close: vi.fn(),
    cook: {
      preview: null, isLoading: false, leftover: 0, setLeftover: vi.fn(), confirm: vi.fn(), notCooked: vi.fn(), busy: false, error: null,
      result: null, outcome: null, warnings: [], dismissWarning: vi.fn(), courseId: null, usedFrom: noUsedFrom(),
    },
    confirm: vi.fn(), skip: vi.fn(), quickCook: vi.fn(), quickBusy: null, warnings: [], dismissWarning: vi.fn(),
    shortfalls: [], dismissShortfalls: vi.fn(), correct: INERT_CORRECTION,
    ...over,
  }
}

describe('CookFlowSheets', () => {
  it('renders nothing visible while idle', () => {
    render(<CookFlowSheets flow={flow()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('opens the Mark as Cooked sheet for the flow key', () => {
    render(<CookFlowSheets flow={flow({ cookKey: { date: '2026-11-10', mealSlotId: 2, courseId: 1 }, cook: { ...flow().cook, preview: { meal: meal(), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-13', needs: [] } } })} />)
    expect(screen.getByRole('dialog', { name: 'Mark as Cooked' })).toBeInTheDocument()
  })

  it('shows ONE shortfall notice for the flow\'s groups (B9-45, PC-02): one info tile, a DetailList row per Ingredient, no alert', () => {
    const groups = [{ id: '2026-11-10/2/1', mealLabel: 'Tue Dinner', recipeName: 'Chicken curry', warnings: [{ ingredientId: 11, name: 'rice', baseUnit: 'g' as const, have: 0, need: 250, shortfall: 250, message: 'x' }, { ingredientId: 12, name: 'salt', baseUnit: 'g' as const, have: 5, need: 20, shortfall: 15, message: 'x' }] }]
    const { container } = render(<CookFlowSheets flow={flow({ shortfalls: groups })} />)
    expect(container.querySelectorAll('.shortfall-notice')).toHaveLength(1)
    expect(container.querySelector('.shortfall-notice')).toHaveAttribute('data-status', 'info')
    expect(screen.getByText('Stock was short for 2 Ingredients')).toBeInTheDocument()
    expect(container.querySelectorAll('li.detail-row')).toHaveLength(2)
    expect(container.querySelector('.shortfall-notice__subline')).toHaveTextContent('Tue Dinner · Stock stays where it is')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('Correct Stock opens the flow\'s one sheet and Dismiss clears the notice', async () => {
    const groups = [{ id: 'a', mealLabel: 'Tue Dinner', recipeName: 'Chicken curry', warnings: [{ ingredientId: 11, name: 'rice', baseUnit: 'g' as const, have: 0, need: 250, shortfall: 250, message: 'x' }] }]
    const show = vi.fn()
    const dismissShortfalls = vi.fn()
    render(<CookFlowSheets flow={flow({ shortfalls: groups, dismissShortfalls, correct: { ...INERT_CORRECTION, show } })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Correct Stock' }))
    expect(show).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(dismissShortfalls).toHaveBeenCalledTimes(1)
  })

  it('passes the flow\'s Used from controller to the sheet', () => {
    const needs = [{ ingredientId: 11, ingredient: 'Chicken', quantity: 800, baseUnit: 'g' as const, lots: [{ id: 1, quantity: 500, purchased: '2026-11-09', goesOff: null, storagePlaceName: 'Fridge' }] }]
    const usedFrom = renderHook(() => useUsedFrom([{ courseId: 1, courseName: 'Main', needs }], { unitSystem: 'metric', today: '2026-11-10' })).result.current
    const base = flow().cook
    render(<CookFlowSheets flow={flow({ cookKey: { date: '2026-11-10', mealSlotId: 2, courseId: 1 }, cook: { ...base, courseId: 1, usedFrom, preview: { meal: meal({ courseId: 1 }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-13', needs } as CookPreviewWithLots } })} />)
    expect(screen.getByRole('button', { name: /Used from/ })).toBeInTheDocument()
  })
})
