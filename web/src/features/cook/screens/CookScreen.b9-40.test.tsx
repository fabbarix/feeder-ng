// B9-40 (PC-03, PC-16, SHORT-01, DS 3, A11Y-01) on the Recipe route /cook/recipe/:id: the Step layout, the timers as a strip or a rail, tap zones
// at every width, short landscape, the Advance Steps, the document title, and a Recipe cook's Done forgetting the resume Step.
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../plan/test-utils'
import { readResume, saveResume } from '../lib/resume'
import type { CookTimer, CookView } from '../types'
import { CookScreen } from './CookScreen'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))

const LONG = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ')
const view = (over: Partial<CookView> = {}): CookView => ({
  scope: 'recipe:7', recipeId: 7, recipeName: 'Roast chicken', batches: 1, meal: null, today: '2026-11-09',
  advance: [{ step: 4, text: 'Marinate the chicken', leadTimeMinutes: 480, done: false, doneAt: null, warning: true }],
  timers: [],
  steps: [
    { index: 0, number: 1, of: 3, kind: 'passive', text: 'Pre-heat the oven to 220 °C.', durationMinutes: 3, imageUrl: '', uses: [], timer: { label: 'Step 1: Pre-heat the oven to 220 °C.', durationSeconds: 180 }, after: [] },
    { index: 1, number: 2, of: 3, kind: 'active', text: LONG, durationMinutes: 2, imageUrl: '/img/s2.jpg', uses: [], timer: null, after: [0] },
    { index: 2, number: 3, of: 3, kind: 'active', text: 'Serve.', durationMinutes: 0, imageUrl: '', uses: [], timer: null, after: [] },
  ],
  ...over,
})
const tm = (id: number, label: string, seconds: number, over: Partial<CookTimer> = {}): CookTimer => ({
  id, scope: 'recipe:7', step: id - 1, label, durationSeconds: 600, state: 'running', remainingSeconds: seconds,
  endsAt: new Date(Date.now() + seconds * 1000).toISOString(), startedAt: '', ...over,
})

type Env = 'phone' | 'desktop' | 'landscape844' | 'landscape667'
/** matchMedia as the CSS sees the device: every min-width band true up to the device's width, the short-landscape query for a phone on its side. */
function device(env: Env) {
  const widths = { phone: 390, desktop: 1440, landscape844: 844, landscape667: 667 }
  const w = widths[env]
  vi.stubGlobal('innerWidth', w)
  vi.stubGlobal('matchMedia', (q: string) => {
    const min = /min-width:\s*([\d.]+)em/.exec(q)
    let matches = false
    if (q === '(max-height: 499px) and (min-width: 37.5em)') matches = env === 'landscape844' || env === 'landscape667'
    else if (min) matches = w >= Number(min[1]) * 16
    return { matches, media: q, addEventListener: () => {}, removeEventListener: () => {} }
  })
}

function setup(env: Env, o: { view?: CookView; timers?: CookTimer[]; route?: string } = {}) {
  device(env)
  let list = o.timers ?? []
  const api = mockApi({
    'GET /api/cook/recipes/7?batches=1': o.view ?? view(),
    'GET /api/cook/timers': () => ({ now: new Date().toISOString(), timers: list }),
    'POST /api/cook/timers': () => tm(99, 'x', 60),
    'DELETE /api/cook/timers/1': () => {
      list = []
      return { status: 204 }
    },
    'GET /api/plan': { today: '2026-11-09', horizonDays: 3, updating: false, slots: [] },
  })
  renderWithProviders(
    <Routes>
      <Route path="/cook/recipe/:id" element={<CookScreen />} />
      <Route path="/recipes/:id" element={<p>Recipe page</p>} />
    </Routes>,
    o.route ?? '/cook/recipe/7',
  )
  return api
}

beforeEach(() => {
  window.localStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Cook Mode title (A11Y-01)', () => {
  it('the document title is "Cook Mode · <Recipe> · Feeder"', async () => {
    setup('phone')
    await screen.findByRole('article', { name: 'Step 1 of 3' })
    await waitFor(() => expect(document.title).toBe('Cook Mode · Roast chicken · Feeder'))
  })
  it('while the Recipe loads it is "Cook Mode · Feeder", never just "Feeder"', async () => {
    setup('phone')
    expect(document.title).toBe('Cook Mode · Feeder')
    await screen.findByRole('article', { name: 'Step 1 of 3' })
  })
})

describe('Step tile on the Recipe route (PC-03, PC-16)', () => {
  it('opens on "Step 1 of 3 · Passive · 3 min timer" with the oven temperature kept together', async () => {
    setup('phone')
    const tile = await screen.findByRole('article', { name: 'Step 1 of 3' })
    expect(within(tile).getByRole('status')).toHaveTextContent('Step 1 of 3 · Passive · 3 min timer')
    expect(within(tile).getByText(/Pre-heat the oven/).textContent).toBe('Pre-heat the oven to 220 °C.')
  })
  it('a long Step with a photo is data-length="long" and its photo is capped in a figure with Enlarge', async () => {
    setup('phone')
    await screen.findByRole('article', { name: 'Step 1 of 3' })
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    const tile = await screen.findByRole('article', { name: 'Step 2 of 3' })
    expect(within(tile).getByText(/^word0 /)).toHaveAttribute('data-length', 'long')
    expect(tile.querySelector('figure.cook-step__photo img')).not.toBeNull()
    expect(within(tile).getByRole('button', { name: 'Enlarge the photo' })).toBeInTheDocument()
  })
  it('Scenario: A long Step with a photo still shows Back and Next (both stay in the sticky nav)', async () => {
    setup('phone')
    await screen.findByRole('article', { name: 'Step 1 of 3' })
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('article', { name: 'Step 2 of 3' })
    const nav = document.querySelector('.cook-nav')!
    expect(within(nav as HTMLElement).getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(within(nav as HTMLElement).getByRole('button', { name: 'Next' })).toBeInTheDocument()
  })
})

describe('Tap zones at every width (decision SHORT 3)', () => {
  it('a phone portrait has the two zones and the coach mark; a tap on the right half goes next and the mark never comes back', async () => {
    setup('phone')
    const tile = await screen.findByRole('article', { name: 'Step 1 of 3' })
    expect(tile.querySelectorAll('[data-zone]')).toHaveLength(2)
    expect(screen.getByText('Tap the right side for next, the left side for back')).toBeInTheDocument()
    vi.spyOn(tile, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 400, right: 400, top: 0, bottom: 300, height: 300, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.click(tile, { clientX: 300, clientY: 100 })
    expect(await screen.findByRole('article', { name: 'Step 2 of 3' })).toBeInTheDocument()
    expect(screen.queryByText('Tap the right side for next, the left side for back')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('feeder.cook.coach')).toBe('seen')
  })
  it('Scenario: Scrolling a long Step on a phone does not change the Step', async () => {
    setup('phone')
    const tile = await screen.findByRole('article', { name: 'Step 1 of 3' })
    vi.spyOn(tile, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 400, right: 400, top: 0, bottom: 300, height: 300, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.pointerDown(tile, { clientX: 300, clientY: 260, pointerId: 1 })
    fireEvent.click(tile, { clientX: 300, clientY: 120 })
    expect(screen.getByRole('article', { name: 'Step 1 of 3' })).toBeInTheDocument()
    // ... and a real tap on the same tile does turn it (the zones exist at this width, so the scroll above was judged, not ignored)
    fireEvent.pointerDown(tile, { clientX: 300, clientY: 100, pointerId: 1 })
    fireEvent.click(tile, { clientX: 301, clientY: 100 })
    expect(await screen.findByRole('article', { name: 'Step 2 of 3' })).toBeInTheDocument()
  })
})

describe('Timers: a strip on a phone, a rail from 1024 px (PC-03)', () => {
  const two = () => [tm(1, 'Step 1: Pre-heat the oven to 220 °C.', 163), tm(2, 'Step 4: Simmer the rice', 680, { step: 3 })]

  it('Scenario: The timer that holds Next is visible with the Step: the strip is in the sticky nav, the holding pill first and marked, and the held line names it', async () => {
    setup('phone', { timers: two() })
    await screen.findByRole('article', { name: 'Step 1 of 3' })
    const region = await screen.findByRole('region', { name: 'Timers' })
    expect(region.closest('.cook-nav')).not.toBeNull()
    expect(within(region).getAllByRole('timer').map((t) => t.getAttribute('aria-label'))[0]).toBe('Pre-heat the oven to 220 °C.')
    await waitFor(() => expect(within(region).getByRole('timer', { name: 'Pre-heat the oven to 220 °C.' })).toHaveAttribute('data-gate'))
    expect(screen.getByText(/Next waits for the oven: 2:\d\d left\. Cancel that timer to go on now\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('from 1024 px the timers are a rail beside the Step, not in the nav', async () => {
    setup('desktop', { timers: two() })
    await screen.findByRole('article', { name: 'Step 1 of 3' })
    const rail = await screen.findByRole('complementary', { name: 'Timers' })
    expect(within(rail).getAllByRole('timer')).toHaveLength(2)
    expect(document.querySelector('.cook-nav')!.contains(rail)).toBe(false)
    expect(document.querySelector('.cook-nav [role="timer"]')).toBeNull()
  })

  it('Scenario: I can undo a cancelled timer: a pill opens its sheet; Cancel timer deletes it and an Undo toast starts it again', async () => {
    const api = setup('phone', { timers: [tm(1, 'Step 1: Pre-heat the oven', 163)] })
    await screen.findByRole('article', { name: 'Step 1 of 3' })
    await userEvent.click(await screen.findByRole('button', { name: /^Timer: Pre-heat the oven/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Pre-heat the oven' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel timer' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/cook/timers/1')).toHaveLength(1))
    const toast = await waitFor(() => {
      const el = document.querySelector('.toast') as HTMLElement | null
      expect(el).not.toBeNull()
      return el!
    })
    expect(toast).toHaveTextContent('Timer cancelled')
    expect(toast).toHaveTextContent('Pre-heat the oven')
    await userEvent.click(within(toast).getByRole('button', { name: /^Undo/ }))
    await waitFor(() => expect(api.callsTo('POST', '/api/cook/timers')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/cook/timers')[0]!.body).toMatchObject({ scope: 'recipe:7', step: 0, label: 'Step 1: Pre-heat the oven' })
  })
})

describe('Advance Steps (DS 3, PC-03, SHORT-01)', () => {
  it('Step 1 shows the info tile; the next Steps show one info line', async () => {
    setup('phone')
    await screen.findByRole('article', { name: 'Step 1 of 3' })
    expect(document.querySelector('.cook-advance')).toHaveAttribute('data-status', 'info')
    expect(document.querySelector('.cook-advance-line')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('article', { name: 'Step 2 of 3' })
    expect(document.querySelector('.cook-advance')).toBeNull()
    expect(document.querySelector('.cook-advance-line')).toHaveTextContent('1 Advance Step to do')
  })
})

describe('Scenario: A cook in phone landscape sees the whole current Step without scrolling (SHORT-01)', () => {
  it('the Advance Steps are a chip, not a tile, and the chip opens them', async () => {
    setup('landscape844')
    await screen.findByRole('article', { name: 'Step 1 of 3' })
    expect(document.querySelector('.cook-advance')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Advance Steps: 1 to do' }))
    expect(await screen.findByRole('dialog', { name: 'Advance Steps' })).toBeInTheDocument()
  })

  it('Scenario: With three timers running in phone landscape, the strip shows whole pills and a "+1" that opens all timers (844 wide: two pills)', async () => {
    setup('landscape844', { timers: [tm(1, 'Step 1: Pre-heat the oven', 163), tm(2, 'Step 4: Simmer the rice', 680, { step: 3 }), tm(3, 'Step 5: Rest the meat', 900, { step: 4 })] })
    await screen.findByRole('article', { name: 'Step 1 of 3' })
    const region = await screen.findByRole('region', { name: 'Timers' })
    expect(within(region).getAllByRole('timer')).toHaveLength(2)
    await userEvent.click(within(region).getByRole('button', { name: '1 more timer. Show all timers' }))
    const all = await screen.findByRole('dialog', { name: 'Timers' })
    expect(within(all).getByText('Rest the meat')).toBeInTheDocument()
    expect(within(all).getByText('Simmer the rice')).toBeInTheDocument()
    // a row opens that timer's own sheet
    await userEvent.click(within(all).getByRole('button', { name: /Rest the meat/ }))
    expect(await screen.findByRole('dialog', { name: 'Rest the meat' })).toBeInTheDocument()
  })

  it('at 667 wide (the smallest landscape) only one whole pill shows', async () => {
    setup('landscape667', { timers: [tm(1, 'Step 1: Pre-heat the oven', 163), tm(2, 'Step 4: Simmer the rice', 680, { step: 3 })] })
    await screen.findByRole('article', { name: 'Step 1 of 3' })
    const region = await screen.findByRole('region', { name: 'Timers' })
    expect(within(region).getAllByRole('timer')).toHaveLength(1)
    expect(within(region).getByRole('button', { name: '1 more timer. Show all timers' })).toBeInTheDocument()
  })

  it('Back and Next carry their arrows (the side columns)', async () => {
    setup('landscape844')
    await screen.findByRole('article', { name: 'Step 1 of 3' })
    for (const name of ['Back', 'Next']) expect(screen.getByRole('button', { name }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('A Recipe cook\'s Done forgets the resume Step (standing ruling)', () => {
  it('"Back to Recipe" clears the saved Step and goes to the Recipe', async () => {
    saveResume('recipe:7', 2)
    expect(readResume('recipe:7')).not.toBeNull()
    setup('phone')
    await screen.findByRole('article', { name: 'Step 3 of 3' })
    await userEvent.click(screen.getByRole('button', { name: 'Back to Recipe' }))
    expect(await screen.findByText('Recipe page')).toBeInTheDocument()
    expect(readResume('recipe:7')).toBeNull()
  })
})
