// B5-LOW wiring, U5: Mark as Cooked from a frozen Leftover takes only the portions used (server behaviour); the Pantry shows what
// is left, still frozen, once the plan event makes it refetch.
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { frozenChilli } from '../../../lib/leftovers/fixtures'
import type { Leftover } from '../../../lib/leftovers'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { makeLot, makeTotal } from '../testData'
import { StockScreen } from './StockScreen'

const sse = vi.hoisted(() => {
  const handlers: Record<string, () => void> = {}
  const connection = {
    subscribe: vi.fn((topic: string, handler: () => void) => {
      handlers[topic] = handler
      return vi.fn()
    }),
    onReconnect: vi.fn(() => vi.fn()),
    close: vi.fn(),
  }
  return { handlers, connectEvents: vi.fn(() => connection) }
})
vi.mock('../../../lib/sse', () => ({ connectEvents: sse.connectEvents }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [], isLoading: false }) }))

beforeEach(() => vi.stubGlobal('EventSource', class {}))
afterEach(() => vi.unstubAllGlobals())

const lot = makeLot({ id: 12, ingredientId: 8, ingredientName: 'peas', quantity: 900, goesOff: '2027-02-01', spoiled: false, storagePlaceId: 2 })
const three = frozenChilli({ id: 5, portions: 3, useBy: '2027-02-10' })
const one = { ...three, portions: 1 }

describe('Pantry: Cooked from a frozen Leftover', () => {
  it('refetches on a plan event and shows the portions that remain, still frozen in the same Freezer with the same Use-by', async () => {
    let current: Leftover[] = [three]
    const api = mockApi({
      'GET /api/stock': { ingredients: [makeTotal({ ingredientId: 8, name: 'peas', total: 900, lotCount: 1 })] },
      'GET /api/stock/lots': { lots: [lot], today: '2026-11-11' },
      'GET /api/stock/spoiled': { lots: [], today: '2026-11-11' },
      'GET /api/storage-places': [{ id: 2, name: 'Garage Freezer', kind: 'freezer', default: false }],
      'GET /api/plan/leftovers': () => ({ leftovers: current }),
    })
    renderWithProviders(<StockScreen />, '/stock')
    const freezer = await waitFor(() => screen.getByRole('list', { name: /^Garage Freezer/ }))
    expect(await within(freezer).findByText('3 portions · Use by 10 Feb')).toBeInTheDocument()

    // Mark as Cooked on the Plan used 2 of the 3 portions; the server publishes on the plan topic.
    current = [one]
    expect(sse.handlers['plan']).toBeDefined()
    sse.handlers['plan']!()

    expect(await within(screen.getByRole('list', { name: /^Garage Freezer/ })).findByText('1 portion · Use by 10 Feb')).toBeInTheDocument()
    expect(screen.queryByText('3 portions · Use by 10 Feb')).toBeNull()
    expect(api.callsTo('GET', '/api/plan/leftovers').length).toBeGreaterThanOrEqual(2)
  })

  it('a Leftover with no portions left is gone from the Pantry', async () => {
    let current: Leftover[] = [one]
    mockApi({
      'GET /api/stock': { ingredients: [makeTotal({ ingredientId: 8, name: 'peas', total: 900, lotCount: 1 })] },
      'GET /api/stock/lots': { lots: [lot], today: '2026-11-11' },
      'GET /api/stock/spoiled': { lots: [], today: '2026-11-11' },
      'GET /api/storage-places': [{ id: 2, name: 'Garage Freezer', kind: 'freezer', default: false }],
      'GET /api/plan/leftovers': () => ({ leftovers: current }),
    })
    renderWithProviders(<StockScreen />, '/stock')
    await screen.findByText('Chilli')
    current = []
    sse.handlers['plan']!()
    await waitFor(() => expect(screen.queryByText('Chilli')).toBeNull())
  })
})
