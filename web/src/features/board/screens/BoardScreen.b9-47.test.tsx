// B9-47: the Kitchen board screen. TB-04 (Close, Esc, idle, the hidden h1), TB-07/SHORT-03 (the layout by viewport), TB-08 + TB 7 (the hero is
// Today's selection, "Tonight" is gone), TB-15c (a load error is an ErrorState with Try again), RES-09 (a tile that throws keeps its slot).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  data: undefined as unknown,
  error: null as Error | null,
  now: new Date('2026-11-09T17:00:00Z'),
  leftovers: [] as unknown[],
  planSlots: [] as unknown[],
  totals: [] as unknown[],
  refetch: vi.fn(),
}))
vi.mock('../hooks/useBoard', () => ({
  useBoard: () => ({ data: h.error ? undefined : h.data, isLoading: false, error: h.error, refetch: h.refetch }),
  useBoardScheme: () => ({ dark: false }),
  useAdvanceDone: () => vi.fn(),
  useNow: () => h.now,
}))
vi.mock('../hooks/useBoardPalette', () => ({ useBoardPalette: () => undefined }))
vi.mock('../../plan', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../plan')>()),
  usePlan: () => ({ slots: h.planSlots }),
  useLeftovers: () => ({ leftovers: h.leftovers }),
}))
vi.mock('../../stock/hooks/useStock', () => ({ useStockTotals: () => ({ data: h.totals }) }))
vi.mock('../../cook/hooks/useTimers', () => ({ useTimers: () => ({ items: [] }) }))
vi.mock('../../settings/hooks/useHouseholdSettings', () => ({ useHouseholdSettings: () => ({ settings: { timeZone: 'UTC' } }) }))

import { originalMatchMedia, viewport } from '../test-viewport'
import { boardData, course, meal, slotOn, TODAY, TOMORROW } from '../test-utils'
import { BoardScreen } from './BoardScreen'

const dinner = (date: string) => slotOn(date, 3, 'Dinner', '19:00', [course(1, 'Main', true, { meal: meal('Roast chicken') }), course(2, 'Side', false, { meal: meal('Green beans') })], { startBy: '13:00', cookMinutes: 360 })
const lunch = (date: string) => slotOn(date, 2, 'Lunch', '13:00', 'Lentil soup')
const breakfast = (date: string) => slotOn(date, 1, 'Breakfast', '08:30', 'Porridge')

function CookRoute() {
  const { date, slotId } = useParams()
  return <p>Cook timeline {date}/{slotId}</p>
}

function view(entries = ['/board'], index = 0) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={entries} initialIndex={index}>
        <Routes>
          <Route path="/board" element={<BoardScreen />} />
          <Route path="/cook/meal/:date/:slotId" element={<CookRoute />} />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  h.data = boardData({ slots: [dinner(TODAY), breakfast(TOMORROW), dinner(TOMORROW)] })
  h.error = null
  h.now = new Date(`${TODAY}T17:00:00Z`)
  h.leftovers = []
  h.planSlots = []
  h.totals = []
  h.refetch = vi.fn()
  viewport(1280, 800)
})
afterEach(() => {
  globalThis.matchMedia = originalMatchMedia
  vi.useRealTimers()
})

describe('the hidden h1 (A11Y-12, TB-15d)', () => {
  it('is "Kitchen board", visually hidden, the page title target, and not in the tab order', () => {
    view()
    const h1 = screen.getByRole('heading', { level: 1, name: 'Kitchen board' })
    expect(h1).toHaveClass('visually-hidden')
    expect(h1).toHaveAttribute('id', 'page-title')
    expect(h1.tabIndex).toBeLessThan(0)
  })
  it('the document title stays "Kitchen board · Feeder"', () => {
    view()
    expect(document.title).toBe('Kitchen board · Feeder')
  })
  it('there is exactly one h1', () => {
    view()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})

describe('Close kitchen board (TB-04)', () => {
  it('is the first focusable element of the board, in the clock tile', async () => {
    view()
    await userEvent.tab()
    const close = screen.getByRole('link', { name: 'Close kitchen board' })
    expect(document.activeElement).toBe(close)
    expect(close.closest('.board-clock')).not.toBeNull()
  })
  it('opened directly it is a link to Today', async () => {
    view()
    await userEvent.click(screen.getByRole('link', { name: 'Close kitchen board' }))
    expect(await screen.findByText('elsewhere')).toBeInTheDocument()
  })
  it('opened from inside the app it is a button and goes back one entry', async () => {
    view(['/settings/household', '/board'], 1)
    await userEvent.click(screen.getByRole('button', { name: 'Close kitchen board' }))
    expect(await screen.findByText('elsewhere')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Kitchen board' })).not.toBeInTheDocument()
  })
  it('Esc does the same: directly opened it goes to Today ("/")', async () => {
    const { container } = view()
    await userEvent.keyboard('{Escape}')
    expect(await screen.findByText('elsewhere')).toBeInTheDocument()
    expect(container.querySelector('.board-screen')).toBeNull()
  })
  it('Esc from a board opened inside the app goes back one entry', async () => {
    view(['/settings/household', '/board'], 1)
    await userEvent.keyboard('{Escape}')
    expect(await screen.findByText('elsewhere')).toBeInTheDocument()
  })
  it('dims after 10 s without input and returns to full strength on any input', () => {
    vi.useFakeTimers()
    const { container } = view()
    const close = () => container.querySelector('.board-close')!
    expect(close()).not.toHaveAttribute('data-idle', 'true')
    act(() => void vi.advanceTimersByTime(10_000))
    expect(close()).toHaveAttribute('data-idle', 'true')
    act(() => void window.dispatchEvent(new Event('pointermove', { bubbles: true })))
    expect(close()).not.toHaveAttribute('data-idle', 'true')
  })
})

describe('the layout follows the viewport (TB-07, SHORT-03)', () => {
  const layout = () => document.querySelector('.board-grid')?.getAttribute('data-layout')
  it.each([
    [1280, 800, 'wall'],
    [1024, 768, 'wall'],
    [2560, 1440, 'wall'],
    [800, 560, 'wall'],
    [844, 390, 'scroll'],
    [800, 559, 'scroll'],
    [667, 375, 'scroll'],
    [820, 1180, 'portrait'],
    [600, 1000, 'portrait'],
    [390, 844, 'phone'],
    [375, 667, 'phone'],
    [599, 400, 'phone'],
  ])('%i x %i is the %s layout', (w, hgt, kind) => {
    viewport(w, hgt)
    view()
    expect(layout()).toBe(kind)
  })

  it('portrait: the hero is a full row, with 8 cells in a 2-column grid', () => {
    viewport(820, 1180)
    view()
    const cells = [...document.querySelectorAll<HTMLElement>('.board-cell')]
    expect(cells).toHaveLength(8)
    // the clock cell is first in the DOM (TB-04: Close is the first focusable element), so the hero is found by its data-cell
    const hero = document.querySelector<HTMLElement>('.board-cell[data-cell="tonight"]')!
    expect({ column: hero.style.gridColumn, row: hero.style.gridRow }).toEqual({ column: '1 / span 2', row: '1 / span 1' })
  })
  it('scroll: the hero is 2 x 2 and Tomorrow spans columns 1 to 2 of row 3', () => {
    viewport(844, 390)
    view()
    const by = (id: string) => document.querySelector<HTMLElement>(`.board-cell[data-cell="${id}"]`)!
    expect({ column: by('tonight').style.gridColumn, row: by('tonight').style.gridRow }).toEqual({ column: '1 / span 2', row: '1 / span 2' })
    expect({ column: by('tomorrow').style.gridColumn, row: by('tomorrow').style.gridRow }).toEqual({ column: '1 / span 2', row: '3 / span 1' })
  })
})

describe('the hero is Today\'s selection, in Today\'s eyebrow (TB-01, TB-08, TB 7)', () => {
  const eyebrow = () => document.querySelector('.board-eyebrow')?.textContent?.replace(/\s+/g, ' ').trim()
  it('at breakfast time the board says Breakfast, not Tonight', () => {
    h.data = boardData({ slots: [breakfast(TODAY), lunch(TODAY), dinner(TODAY)] })
    h.now = new Date(`${TODAY}T07:00:00Z`)
    view()
    expect(eyebrow()).toBe('Today · Breakfast · 08:30')
    expect(screen.getByText('Porridge')).toBeInTheDocument()
    expect(screen.queryByText(/tonight/i)).not.toBeInTheDocument()
  })
  it('at 14:44 Lunch has gone: Dinner, "start now", with the start line and the Courses', () => {
    h.data = boardData({ slots: [breakfast(TODAY), lunch(TODAY), dinner(TODAY)] })
    h.now = new Date(`${TODAY}T14:44:00Z`)
    view()
    expect(eyebrow()).toBe('Today · Dinner · start now')
    expect(screen.getByText('Start 13:00 · ready 19:00')).toBeInTheDocument()
    expect(screen.getByText('Roast chicken')).toBeInTheDocument()
    expect(screen.queryByText('Lentil soup')).not.toBeInTheDocument()
  })
  it('after the last slot of today the hero is tomorrow\'s Breakfast, said so', () => {
    h.data = boardData({ slots: [dinner(TODAY), breakfast(TOMORROW)] })
    h.now = new Date(`${TODAY}T20:00:00Z`)
    view()
    expect(eyebrow()).toBe('Tomorrow · Breakfast')
  })
  it('Cook opens the Cook timeline of the hero slot, with no Course in the route', async () => {
    h.data = boardData({ slots: [breakfast(TODAY), lunch(TODAY), dinner(TODAY)] })
    h.now = new Date(`${TODAY}T14:44:00Z`)
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Cook Dinner' }) /* B9-47 ruling 5 (P38): Cook names its slot */)
    expect(await screen.findByText(`Cook timeline ${TODAY}/3`)).toBeInTheDocument()
  })
  it('reads the plan\'s slots as before when the payload has none (an older server)', () => {
    h.data = boardData({ slots: undefined })
    h.planSlots = [dinner(TODAY)]
    view()
    expect(eyebrow()).toBe('Today · Dinner · start 13:00')
    expect(screen.getByText('Roast chicken')).toBeInTheDocument()
  })
  it('the tiles carry the board\'s vocabulary: Leftovers with "Use by", Use soon with the day, Tomorrow as "Slot: Recipe"', () => {
    h.data = boardData({ slots: [dinner(TODAY), breakfast(TOMORROW)] })
    h.leftovers = [{ id: 1, recipeId: 1, recipeName: 'Slow cooker beef and barley stew', portions: 1.25, useBy: '2026-11-10' }]
    h.totals = [{ ingredientId: 1, name: 'Flour', baseUnit: 'g', total: 500, nextGoesOff: TOMORROW, useSoon: true, spoiledCount: 0 }]
    view()
    expect(screen.getByText('1.25 portions · Use by tomorrow')).toBeInTheDocument()
    expect(screen.getByLabelText('Flour, good until tomorrow')).toBeInTheDocument()
    expect(screen.getByText('Breakfast:').closest('li')?.textContent).toBe('Breakfast: Porridge')
  })
})

describe('a load error is an ErrorState (TB-15c)', () => {
  beforeEach(() => {
    h.error = new Error('boom')
  })
  it('role=alert with the message, the warning icon and Try again, not an accent empty state', () => {
    const { container } = view()
    const alert = screen.getByText('The kitchen board could not be loaded').closest('[role="alert"]')!
    expect(alert).toHaveClass('error-state')
    expect(container.querySelector('.empty-state')).toBeNull()
    expect(within(alert as HTMLElement).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
  it('Try again reloads the board', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(h.refetch).toHaveBeenCalledTimes(1)
  })
  it('the way out is still there: the error state keeps the h1 and the Close control', () => {
    view()
    expect(screen.getByRole('heading', { level: 1, name: 'Kitchen board' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Close kitchen board' })).toBeInTheDocument()
  })
})

describe('a tile that throws keeps its slot (RES-09)', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
  afterEach(() => vi.restoreAllMocks())

  it('wraps each of the 8 tiles in its own TileErrorBoundary, inside its cell', () => {
    view()
    expect(document.querySelectorAll('.board-cell > .tile-boundary')).toHaveLength(8)
  })

  it('a malformed Leftover crashes only the Leftovers tile: it says so, and the rest of the board is fine', () => {
    h.leftovers = [{ id: 1, recipeId: 1, recipeName: 'Stew', portions: 2, useBy: null }]
    view()
    const alert = screen.getByRole('alert', { name: 'Leftovers' })
    expect(alert).toHaveTextContent('Leftovers couldn’t be shown.')
    expect(alert).toHaveTextContent('The rest of the Kitchen board is fine.')
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    for (const name of ['Next Advance Step', 'Timers', 'Tomorrow', 'Use soon', 'Zero-waste streak']) expect(screen.getByRole('region', { name })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Close kitchen board' })).toBeInTheDocument()
  })

  it('Try again renders the tile once its data is good', async () => {
    h.leftovers = [{ id: 1, recipeId: 1, recipeName: 'Stew', portions: 2, useBy: null }]
    view()
    h.leftovers = [{ id: 1, recipeId: 1, recipeName: 'Stew', portions: 2, useBy: '2026-11-12' }]
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('region', { name: 'Leftovers' })).toBeInTheDocument()
    expect(screen.queryByRole('alert', { name: 'Leftovers' })).not.toBeInTheDocument()
  })
})
