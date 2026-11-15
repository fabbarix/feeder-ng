// B9-44 (TB-02, TB-09, TB-11, TB-12, RES-05, SAFE-09/SSP-17 on Today, PC-02 wiring): Today's tiles on the real screen. The seams are mocked as in the
// other TodayScreen tests (`spoiledCalls` is the seam's new field: the Pantry's Keep and Throw out calls with their Undo calls); the session
// seam (../shoppingSeam, new) and the Household date (app/useHouseholdDate) are mocked here; the stock module keeps its real hooks and sheets
// except LotSheetHost (new: the Pantry's Lot sheet, which Use soon rows open over Today).
// 2026-11-09 is a Monday.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findToast } from '../../../test/notices'
import { courseMeal, mockApi, renderWithProviders, slot } from '../../plan/test-utils'
import type { PlanEntry } from '../../plan/types'
import { TodayScreen } from './TodayScreen'

const h = vi.hoisted(() => ({
  toConfirm: [] as unknown[], couldnt: [] as unknown[], leftovers: [] as unknown[], spoiled: [] as unknown[], useSoon: [] as unknown[], steps: [] as unknown[],
  nextSlot: null as unknown, planLoading: false, session: null as unknown, lines: 0,
  throwOut: vi.fn(), keep: vi.fn(), undoThrowOut: vi.fn(), undoKeep: vi.fn(), end: vi.fn(), resume: vi.fn(),
}))

vi.mock('../seams', () => ({
  useScanSessionActive: () => false,
  useTodayPlan: () => ({ today: '2026-11-09', hasNextMeal: h.nextSlot !== null, toConfirm: h.toConfirm.length, couldntPlan: h.couldnt.length, leftovers: h.leftovers.length, loading: h.planLoading }),
  useTodayStock: () => ({ spoiled: h.spoiled.length, useSoon: h.useSoon, loading: false }),
  useTodayTileData: () => ({
    now: new Date('2026-11-09T12:00:00Z'), nextSlot: h.nextSlot, nextDay: 'today', nextAction: 'cook', toConfirm: h.toConfirm, justServed: [], couldntPlan: h.couldnt, planSlots: h.couldnt,
    leftovers: h.leftovers, planToday: h.planLoading ? '' : '2026-11-09', spoiled: h.spoiled, stockToday: '2026-11-09', system: 'metric', useSoon: h.useSoon,
    throwOut: vi.fn(), keep: vi.fn(), spoiledCalls: { throwOut: h.throwOut, keep: h.keep, undoThrowOut: h.undoThrowOut, undoKeep: h.undoKeep },
    planLoading: h.planLoading, stockLoading: false,
  }),
  ShoppingListSeam: () => createElement('p', null, 'The Shopping List'),
}))
vi.mock('../shoppingSeam', () => ({ useShoppingSession: () => h.session }))
vi.mock('../shopSeam', () => ({ useLinesToGet: () => ({ count: h.lines, loading: false }) }))
vi.mock('../../../app/useHouseholdDate', () => ({ useHouseholdDate: () => '2026-11-09' }))
vi.mock('../../stock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../stock')>()),
  LotSheetHost: (p: { lotId: number | null; onClose: () => void }) =>
    p.lotId === null ? null : createElement('div', { role: 'dialog', 'aria-label': `Lot ${p.lotId}` }, createElement('button', { onClick: p.onClose }, 'Close Lot')),
}))

const none = { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 }
const unplanned = (id: number): PlanEntry => ({ date: '2026-11-1' + id, mealSlotId: 10 + id, name: 'Dinner', time: '19:00', at: `2026-11-1${id}T19:00:00Z`, portions: 0, courseId: 1, courseName: 'Main', meal: null, rules: [], unfilled: { reason: 'no_attendance', slotRuleClaimed: false, eliminated: none } }) as PlanEntry
const confirmEntry = (): PlanEntry => slot({ date: '2026-11-09', mealSlotId: 1, name: 'Lunch', courseId: 1, courseName: 'Main', meal: courseMeal(1, 'Main', { recipeName: 'Lentil soup', mealSlotId: 1, date: '2026-11-09' }) })
const leftover = (id: number, name: string, useBy: string) => ({ id, recipeId: id, recipeName: name, portions: 2, cookedOn: '2026-11-08', useBy, fromDate: '2026-11-08', fromMealSlotId: 2 })
const lot = (id: number, name: string) => ({ id, ingredientId: id, ingredientName: name, baseUnit: 'g', quantity: 500, purchased: '2026-11-01', goesOff: '2026-11-08', source: 'manual', productId: null, shopId: null, spoiled: true, useSoon: false })
const step = (n: number) => ({ scope: `plan:2026-11-10:2:${n}`, step: n, mealDate: '2026-11-10', mealSlotId: 2, mealSlotName: 'Dinner', recipeName: 'Cauliflower al gorgonzola', description: `Do step ${n}`, dueAt: '2026-11-09T18:00:00Z', dueTime: '19:00', slotTime: '19:00', state: 'upcoming', overdue: false })
const everything = () => {
  h.toConfirm = [confirmEntry()]
  h.couldnt = [unplanned(1), unplanned(2)]
  h.leftovers = [leftover(1, 'Soup', '2026-11-10')]
  h.spoiled = [lot(7, 'flour')]
  h.useSoon = [{ ingredientId: 3, name: 'Milk', when: 'good until tomorrow', quantity: 500, baseUnit: 'ml', soonestLotId: 31 }]
  h.steps = [step(1)]
  h.lines = 4
}

const places = [{ id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true }, { id: 2, name: 'Garage Freezer', kind: 'freezer', default: false }]
function setup(extra: Record<string, unknown> = {}, route = '/') {
  const api = mockApi({
    'GET /api/today/advance-steps': () => ({ steps: h.steps }),
    'GET /api/today/streak': { days: 5 },
    'GET /api/plan/leftovers': () => ({ leftovers: h.leftovers }),
    'GET /api/storage-places': places,
    'GET /api/household/settings': { frozenUseByDays: 90, defaultLeftoverUseByDays: 3 },
    'PUT /api/cook/marks': (c: { body: unknown }) => {
      const { scope, step: n, done } = c.body as { scope: string; step: number; done: boolean }
      if (done) h.steps = h.steps.filter((s) => (s as { scope: string }).scope !== scope)
      return { scope, step: n, done, doneAt: done ? '2026-11-09T12:00:00Z' : null }
    },
    ...extra,
  } as Parameters<typeof mockApi>[0])
  renderWithProviders(
    <Routes>
      <Route path="/" element={<TodayScreen />} />
      <Route path="/scan" element={<p>Scan screen</p>} />
      <Route path="/cook/meal/:date/:slotId" element={<Where />} />
      <Route path="/cook/*" element={<Where />} />
    </Routes>,
    route,
  )
  return api
}
function Where() {
  const loc = useLocation()
  return <p data-testid="where">{JSON.stringify({ path: loc.pathname, state: loc.state })}</p>
}

beforeEach(() => {
  localStorage.clear()
  h.keep.mockResolvedValue({ id: 7, ingredientName: 'flour', goesOff: '2026-11-09' })
  h.throwOut.mockResolvedValue({ id: 9 })
  h.undoThrowOut.mockResolvedValue({})
  h.undoKeep.mockResolvedValue({})
  h.end.mockResolvedValue(undefined)
})
afterEach(() => {
  for (const k of ['toConfirm', 'couldnt', 'leftovers', 'spoiled', 'useSoon', 'steps'] as const) h[k] = []
  h.nextSlot = null
  h.planLoading = false
  h.session = null
  h.lines = 0
  for (const f of [h.throwOut, h.keep, h.undoThrowOut, h.undoKeep, h.end, h.resume]) f.mockReset()
  vi.unstubAllGlobals()
})

describe('Today: the grid (TB-03, TB-09)', () => {
  it('has the tiles in DOM order, the aside (Advance Steps, the metric strip) right after To confirm, inside .today__aside', async () => {
    everything()
    setup()
    await screen.findByRole('region', { name: 'Advance Steps' })
    const grid = document.querySelector('.today__grid')!
    expect([...grid.querySelectorAll('[data-tile]')].map((n) => n.getAttribute('data-tile'))).toEqual(['toConfirm', 'advanceSteps', 'metrics', 'couldntPlan', 'spoiled', 'leftovers', 'useSoon'])
    expect([...grid.querySelectorAll('.today__aside [data-tile]')].map((n) => n.getAttribute('data-tile'))).toEqual(['advanceSteps', 'metrics'])
  })

  it('every tile but the hero has exactly one TileHeader, and its h2 names the section', async () => {
    everything()
    setup()
    await screen.findByRole('region', { name: 'Use soon' })
    for (const name of ['To confirm', 'Advance Steps', "Couldn't plan", 'Throw out or keep?', 'Leftovers', 'Use soon']) {
      const tile = screen.getByRole('region', { name })
      expect(tile.querySelectorAll('.tile-header'), name).toHaveLength(1)
      expect(tile.querySelector('.tile-header h2'), name).toHaveTextContent(name)
    }
  })

  it('no tile contains a tertiary button', async () => {
    everything()
    setup()
    await screen.findByRole('region', { name: 'Use soon' })
    expect(document.querySelectorAll('.today [data-variant="tertiary"]')).toHaveLength(0)
  })

  it('every <li> is in a <ul> or <ol> (no list row loose in a tile)', async () => {
    everything()
    setup()
    await screen.findByRole('region', { name: 'Leftovers' })
    for (const li of document.querySelectorAll('.today li')) expect(li.parentElement?.tagName, li.textContent ?? '').toMatch(/^(UL|OL)$/)
  })
})

describe('Today: Advance Steps (TB-02)', () => {
  const twoSteps = () => {
    h.steps = [step(1), step(2)]
  }

  it('Done writes the mark, the row leaves, and the toast says "Advance Step done" with the meta, the Step text and Undo (no icon)', async () => {
    twoSteps()
    const api = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Done: Do step 1' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/cook/marks')[0]?.body).toEqual({ scope: 'plan:2026-11-10:2:1', step: 1, done: true }))
    const toast = await findToast('Advance Step done')
    expect(toast).toHaveTextContent('For Tue Dinner · Cauliflower al gorgonzola')
    expect(toast).toHaveTextContent('Do step 1')
    expect(toast.querySelector('.toast__title svg, .toast__icon')).toBeNull()
    expect(within(toast).getByRole('button', { name: /^Undo/ })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Done: Do step 1' })).toBeNull())
  })

  it('Undo clears the mark (done: false) and the row comes back', async () => {
    twoSteps()
    const api = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Done: Do step 1' }))
    const toast = await findToast('Advance Step done')
    await userEvent.click(within(toast).getByRole('button', { name: /^Undo/ }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/cook/marks')[1]?.body).toEqual({ scope: 'plan:2026-11-10:2:1', step: 1, done: false }))
  })

  it('a refused Done keeps the row and says so in a toast', async () => {
    twoSteps()
    setup({ 'PUT /api/cook/marks': { status: 500, json: { error: { code: 'internal', message: 'x' } } } })
    await userEvent.click(await screen.findByRole('button', { name: 'Done: Do step 1' }))
    expect(await findToast('That did not save. Try again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done: Do step 1' })).toBeInTheDocument()
  })

  it('after Done, focus goes to the next row’s Done; after the last one, to the page heading', async () => {
    twoSteps()
    setup()
    const first = await screen.findByRole('button', { name: 'Done: Do step 1' })
    first.focus()
    await userEvent.click(first)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Done: Do step 2' })).toHaveFocus())
    await userEvent.click(screen.getByRole('button', { name: 'Done: Do step 2' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Advance Steps' })).toBeNull())
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toHaveFocus())
  })
})

describe('Today: Use soon and Leftovers lead somewhere (TB-11)', () => {
  it('pressing a Use soon row opens its Lot in the Pantry’s Lot sheet over Today, and closing it returns', async () => {
    everything()
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Milk, 500 ml, good until tomorrow' }))
    const sheet = await screen.findByRole('dialog', { name: 'Lot 31' })
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close Lot' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Lot 31' })).toBeNull())
  })

  it('the header links go to the Pantry: Use soon to ?status=useSoon, Leftovers to ?leftovers=1, Throw out or keep? to ?status=spoiled', async () => {
    everything()
    setup()
    await screen.findByRole('region', { name: 'Use soon' })
    expect(screen.getByRole('link', { name: 'Pantry, Use soon' })).toHaveAttribute('href', '/pantry?status=useSoon')
    expect(screen.getByRole('link', { name: 'Pantry, Leftovers' })).toHaveAttribute('href', '/pantry?leftovers=1')
    expect(screen.getByRole('link', { name: 'Pantry, Throw out or keep?' })).toHaveAttribute('href', '/pantry?status=spoiled')
  })

  it('pressing a Leftover row opens its action sheet over Today', async () => {
    everything()
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /^Soup, 2 portions, Use by Tue/ }))
    const sheet = await screen.findByRole('dialog', { name: /Soup/ })
    expect(within(sheet).getByRole('button', { name: 'Freeze it' })).toBeInTheDocument()
  })
})

describe('Today: Throw out or keep? with Undo and Change (SAFE-09, SSP-17; B9-29 follow-up)', () => {
  it('Keep keeps the Lot good until today and toasts "Flour kept" with Change and Undo; Undo puts the old date back', async () => {
    everything()
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Keep flour' }))
    expect(h.keep).toHaveBeenCalledWith(7)
    const toast = await findToast('Flour kept')
    expect(toast).toHaveTextContent('Good until today')
    expect(within(toast).getByRole('button', { name: 'Change' })).toBeInTheDocument()
    await userEvent.click(within(toast).getByRole('button', { name: /^Undo/ }))
    await waitFor(() => expect(h.undoKeep).toHaveBeenCalledWith(7, '2026-11-08'))
  })

  it('Change opens the good-until sheet over Today', async () => {
    everything()
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Keep flour' }))
    const toast = await findToast('Flour kept')
    await userEvent.click(within(toast).getByRole('button', { name: 'Change' }))
    expect(await screen.findByRole('dialog', { name: /Flour|Good until/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument()
  })

  it('Throw out toasts "500 g Flour thrown out" with Undo, which undoes that waste record', async () => {
    everything()
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Throw out flour' }))
    expect(h.throwOut).toHaveBeenCalledWith(7)
    const toast = await findToast('500 g Flour thrown out')
    await userEvent.click(within(toast).getByRole('button', { name: /^Undo/ }))
    await waitFor(() => expect(h.undoThrowOut).toHaveBeenCalledWith(9))
  })

  it('a failed Throw out shows the error toast and no Undo', async () => {
    everything()
    h.throwOut.mockRejectedValue(new Error('no'))
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Throw out flour' }))
    expect(await findToast('That did not save. Try again.')).toBeInTheDocument()
    expect(document.querySelector('.toast button[data-role="undo"], .toast [aria-label^="Undo"]')).toBeNull()
  })
})

describe('Today: the Shopping tile (TB-12)', () => {
  const session = () => ({ shopId: 7, shopName: 'Coop', scanned: 7, lastScanAt: Date.now() - 4 * 60_000, end: h.end, resume: h.resume })

  it('is the first tile, above the hero and everything else, with the meta from the session and Lines to get', async () => {
    everything()
    h.session = session()
    setup()
    const tile = await screen.findByRole('region', { name: 'Shopping at Coop' })
    expect(document.querySelector('.today__grid [data-tile]')).toHaveAttribute('data-tile', 'shopping')
    expect(within(tile).getByText(/^7 scanned · 4 Lines to get · last Scan [34] min ago$/)).toBeInTheDocument()
  })

  it('Back to Scan resumes that Shop and opens Scan', async () => {
    h.session = session()
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Back to Scan' }))
    expect(h.resume).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Scan screen')).toBeInTheDocument()
  })

  it('Done shopping ends the session through the seam', async () => {
    h.session = session()
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Done shopping' }))
    expect(h.end).toHaveBeenCalledTimes(1)
  })

  it('without a session there is no Shopping tile', async () => {
    everything()
    setup()
    await screen.findByRole('region', { name: 'Use soon' })
    expect(screen.queryByRole('region', { name: /^Shopping at/ })).toBeNull()
  })
})

describe('Today: loading (RES-05)', () => {
  it('while the plan has no data shows the remembered shape as a skeleton, and Use soon and the strip wait for it', async () => {
    everything()
    localStorage.setItem('feeder.today.layout', JSON.stringify({ tiles: [{ id: 'nextMeal' }, { id: 'toConfirm', rows: 3 }, { id: 'metrics' }] }))
    h.planLoading = true
    setup()
    await screen.findByRole('heading', { level: 1, name: 'Today' })
    expect(document.querySelectorAll('.today-skeleton__row')).toHaveLength(3)
    expect(screen.queryByRole('region', { name: 'Use soon' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'At a glance' })).toBeNull()
    expect(document.querySelector('.today')).toHaveAttribute('aria-busy', 'true')
  })

  it('remembers the layout it showed with data for the next launch', async () => {
    everything()
    setup()
    await screen.findByRole('region', { name: 'Use soon' })
    await waitFor(() => expect(JSON.parse(localStorage.getItem('feeder.today.layout') ?? 'null')?.tiles?.map((t: { id: string }) => t.id)).toEqual(['toConfirm', 'advanceSteps', 'metrics', 'couldntPlan', 'spoiled', 'leftovers', 'useSoon']))
  })
})

describe('Today: Cook goes back to Today (B9-45, waits for it: cookLinkFor(key, "/"))', () => {
  it('Cook from the hero opens Cook Mode with state.from "/"', async () => {
    h.nextSlot = slot({ date: '2026-11-09', mealSlotId: 2, name: 'Dinner', time: '19:30', at: '2026-11-09T19:30:00Z', meal: courseMeal(1, 'Main', { recipeName: 'Chicken curry', mealSlotId: 2, date: '2026-11-09' }) })
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /^Cook/ }))
    const where = JSON.parse((await screen.findByTestId('where')).textContent ?? '{}')
    expect(where.path).toMatch(/^\/cook\//)
    expect(where.state).toEqual({ from: '/' })
  })
})
