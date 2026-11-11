// R2-4 L-10: the kitchen board picks the 2-column layout below 600 px (hero full width) and the 4 x 3 wall layout from 600 px.
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../hooks/useBoard', () => ({
  useBoard: () => ({ data: { today: '2026-11-09', streak: { days: 3 }, nextAdvance: null, theme: {} }, isLoading: false, error: null, refetch: vi.fn() }),
  useBoardScheme: () => ({ dark: false }),
  useAdvanceDone: () => vi.fn(),
  useNow: () => new Date('2026-11-09T17:00:00Z'),
}))
vi.mock('../hooks/useBoardPalette', () => ({ useBoardPalette: () => undefined }))
vi.mock('../../plan', () => ({ usePlan: () => ({ slots: [] }), useLeftovers: () => ({ leftovers: [] }) }))
vi.mock('../../stock/hooks/useStock', () => ({ useStockTotals: () => ({ data: [] }) }))
vi.mock('../../cook/hooks/useTimers', () => ({ useTimers: () => ({ items: [] }) }))
vi.mock('../../settings/hooks/useHouseholdSettings', () => ({ useHouseholdSettings: () => ({ settings: { timeZone: 'UTC' } }) }))

import { BoardScreen } from './BoardScreen'

const original = globalThis.matchMedia
function width(wide: boolean) {
  globalThis.matchMedia = ((query: string) => ({
    matches: query.includes('min-width: 600px') ? wide : false,
    media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false,
  })) as unknown as typeof globalThis.matchMedia
}
afterEach(() => {
  globalThis.matchMedia = original
})

const cells = () => [...document.querySelectorAll<HTMLElement>('.board-cell')].map((c) => ({ column: c.style.gridColumn, row: c.style.gridRow }))
const view = () => render(<MemoryRouter><BoardScreen /></MemoryRouter>)

describe('BoardScreen layout switch', () => {
  it('at 600 px and up it uses the wall layout (Tonight 2 x 2 at the top left)', () => {
    width(true)
    view()
    expect(cells()[0]).toEqual({ column: '1 / span 2', row: '1 / span 2' })
    expect(document.querySelectorAll('.board-cell')).toHaveLength(8)
  })
  it('below 600 px Tonight is full width on one row and no cell is wider than 2 columns', () => {
    width(false)
    view()
    expect(cells()[0]).toEqual({ column: '1 / span 2', row: '1 / span 1' })
    for (const c of cells()) expect(c.column).toMatch(/^[12] \/ span [12]$/)
    expect(document.querySelectorAll('.board-cell')).toHaveLength(8)
  })
})
