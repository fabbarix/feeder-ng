import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CookFlow } from '../hooks/useCookFlow'
import { meal } from '../test-utils'
import { CookFlowSheets } from './CookFlowSheets'

function flow(over: Partial<CookFlow> = {}): CookFlow {
  return {
    cookKey: null, open: vi.fn(), close: vi.fn(),
    cook: {
      preview: null, isLoading: false, leftover: 0, setLeftover: vi.fn(), confirm: vi.fn(), notCooked: vi.fn(), busy: false, error: null,
      result: null, outcome: null, warnings: [], dismissWarning: vi.fn(),
    },
    stock: { correction: null, open: vi.fn(), close: vi.fn(), save: vi.fn(), busy: false, error: null },
    confirm: vi.fn(), skip: vi.fn(), quickCook: vi.fn(), quickBusy: null, warnings: [], dismissWarning: vi.fn(),
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
    render(<CookFlowSheets flow={flow({ cookKey: { date: '2026-11-10', mealSlotId: 2 }, cook: { ...flow().cook, preview: { meal: meal(), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-13', needs: [] } } })} />)
    expect(screen.getByRole('dialog', { name: 'Mark as Cooked' })).toBeInTheDocument()
  })

  it('shows one shortfall notice per warning of the flow', () => {
    const warnings = [{ ingredientId: 11, name: 'rice', baseUnit: 'g', have: 0, need: 250, shortfall: 250, message: 'Stock shows no rice, the recipe uses 250 g' }]
    render(<CookFlowSheets flow={flow({ warnings })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Stock shows no rice, the recipe uses 250 g')
  })
})
