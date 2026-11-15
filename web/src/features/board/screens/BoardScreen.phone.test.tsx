// R2-4 L-10: the kitchen board picks the 2-column layout below 600 px (hero full width) and the 4 x 3 wall layout from 600 px.
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../hooks/useBoard', () => ({
  useBoard: () => ({ data: { today: '2026-11-09', streak: { days: 3 }, nextAdvance: null, theme: {} }, isLoading: false, error: null, refetch: vi.fn() }),
  useBoardScheme: () => ({ dark: false }),
  useAdvanceDone: () => vi.fn(),
  useNow: () => new Date('2026-11-09T17:00:00Z'),
}))
vi.mock('../hooks/useBoardPalette', () => ({ useBoardPalette: () => undefined }))
vi.mock('../../plan', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../plan')>()), usePlan: () => ({ slots: [] }), useLeftovers: () => ({ leftovers: [] }) }))
vi.mock('../../stock/hooks/useStock', () => ({ useStockTotals: () => ({ data: [] }) }))
vi.mock('../../cook/hooks/useTimers', () => ({ useTimers: () => ({ items: [] }) }))
vi.mock('../../settings/hooks/useHouseholdSettings', () => ({ useHouseholdSettings: () => ({ settings: { timeZone: 'UTC' } }) }))

import { originalMatchMedia, viewport } from '../test-viewport'
import { BoardScreen } from './BoardScreen'

// B9-47: the wall layout needs 560 px of height as well (SHORT-03), so the viewport answers every query (test-viewport.ts).
function width(wide: boolean) {
  if (wide) viewport(1280, 800)
  else viewport(390, 844)
}
afterEach(() => {
  globalThis.matchMedia = originalMatchMedia
})

const place = (c: HTMLElement) => ({ column: c.style.gridColumn, row: c.style.gridRow })
const cells = () => [...document.querySelectorAll<HTMLElement>('.board-cell')].map(place)
// B9-47 (TB-04): the clock cell comes first in the DOM (its Close is the first focusable element), so the hero is found by its data-cell.
const hero = () => place(document.querySelector<HTMLElement>('.board-cell[data-cell="tonight"]')!)
// B9-47 (RES-09): the board's tiles sit in TileErrorBoundary, which reads the query client.
const view = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><BoardScreen /></MemoryRouter></QueryClientProvider>)

describe('BoardScreen layout switch', () => {
  it('at 600 px and up it uses the wall layout (Tonight 2 x 2 at the top left)', () => {
    width(true)
    view()
    expect(hero()).toEqual({ column: '1 / span 2', row: '1 / span 2' })
    expect(document.querySelectorAll('.board-cell')).toHaveLength(8)
  })
  it('below 600 px Tonight is full width on one row and no cell is wider than 2 columns', () => {
    width(false)
    view()
    expect(hero()).toEqual({ column: '1 / span 2', row: '1 / span 1' })
    for (const c of cells()) expect(c.column).toMatch(/^[12] \/ span [12]$/)
    expect(document.querySelectorAll('.board-cell')).toHaveLength(8)
  })
})

describe('A11Y-01 (B9-19): the kitchen board names the document', () => {
  it('the document title is "Kitchen board · Feeder" (the board has no PageHeader)', () => {
    width(true)
    view()
    expect(document.title).toBe('Kitchen board · Feeder')
  })
})
