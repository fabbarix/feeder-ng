// B9-45 (PC-02): the Cooked moment in Cook Mode. A friendly confirmation, ONE notice for every short Ingredient, ONE Correct Stock sheet, no toast,
// the way back to where Cook Mode was opened from, and Undo Cooked.
//   Scenario: After cooking, I see one notice listing each short Ingredient with what is missing.
//   Scenario: I correct Stock for all short Ingredients in one sheet.
//   Scenario: Cook Mode returns me to the Plan when I started there.
//   Scenario: A Cooked confirmation never shows a danger tile.
//   Scenario: I undo a Cooked from the confirmation.
// 2026-11-09 is a Monday; 2026-11-10 a Tuesday.
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { allCookedResult, courseMeal, meal, mockApi, newQueryClient } from '../../plan/test-utils'
import type { CookedResult, CookPreview, StockWarning } from '../../plan/types'
import { oneCourseTimeline, timelineView } from '../timeline-fixtures'
import type { CookView, TimelineView } from '../types'
import { CookScreen } from './CookScreen'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))

const warning = (ingredientId: number, name: string, have: number, need: number): StockWarning => ({
  ingredientId, name, baseUnit: 'g', have, need, shortfall: need - have, message: `Stock shows only ${have} g ${name}, the recipe uses ${need} g`,
})
const shortages = [warning(1, 'Cauliflower', 0, 800), warning(2, 'Gorgonzola', 0, 250), warning(3, 'Chestnut mushrooms', 100, 300)]

const mealView: CookView = {
  scope: 'meal:2026-11-09/2', recipeId: 7, recipeName: 'Cauliflower al gorgonzola', batches: 1, meal: { date: '2026-11-09', mealSlotId: 2 }, today: '2026-11-09', advance: [],
  steps: [{ index: 0, number: 1, of: 1, kind: 'active', text: 'Roast the cauliflower', durationMinutes: 40, imageUrl: '', uses: [], timer: null }],
  timers: [],
}
const preview: CookPreview = {
  meal: meal({ date: '2026-11-09', mealSlotId: 2, recipeName: 'Cauliflower al gorgonzola' }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2.75,
  proposedLeftover: 1.25, maxLeftover: 4, leftoverUseBy: '2026-11-12', needs: [],
}
const leftover = { id: 3, recipeId: 7, recipeName: 'Cauliflower al gorgonzola', portions: 1.25, cookedOn: '2026-11-09', useBy: '2026-11-12', fromDate: '2026-11-09', fromMealSlotId: 2 }
const tuesday = { date: '2026-11-10', mealSlotId: 3, mealSlotName: 'Dinner', recipeName: 'Cauliflower al gorgonzola' }
const cooked = (warnings: StockWarning[], over: Partial<CookedResult> = {}): CookedResult => ({ meal: meal({ state: 'cooked' }), leftover: null, warnings, plannedFor: [], ...over })
const plan = { today: '2026-11-09', horizonDays: 3, updating: false, slots: [] }

let resolved = false
const timeline = () => {
  const open = oneCourseTimeline(mealView)
  return resolved ? { ...open, courses: open.courses.map((c) => ({ ...c, state: 'cooked' as const })), items: [], advance: [] } : open
}
const base = '/api/plan/2026-11-09/2/1'
const routes = (extra: Record<string, unknown> = {}) => ({
  'GET /api/cook/meals/2026-11-09/2/all': () => timeline(),
  'GET /api/plan': plan,
  'GET /api/cook/timers': { now: '2026-11-09T12:00:00Z', timers: [] },
  [`GET ${base}/cook`]: preview,
  [`POST ${base}/cooked`]: () => {
    resolved = true
    return cooked(shortages, { leftover, plannedFor: [tuesday] })
  },
  [`POST ${base}/reopen`]: () => {
    resolved = false
    return { meals: [meal({ state: 'planned' })], stockGone: 0 }
  },
  'PUT /api/stock/ingredients/2/total': { ingredient: {}, lots: [] },
  'PUT /api/stock/ingredients/3/total': { ingredient: {}, lots: [] },
  ...extra,
})

function renderMeal(from?: string) {
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <ToastProvider>
        <ConfirmProvider>
          <MemoryRouter initialEntries={[{ pathname: '/cook/meal/2026-11-09/2', state: from ? { from } : undefined }]}>
            <Routes>
              <Route path="/cook/meal/:date/:slotId" element={<CookScreen />} />
              <Route path="/" element={<p>Home page</p>} />
              <Route path="/plan" element={<p>Plan page</p>} />
            </Routes>
          </MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )
}
async function confirmCooked() {
  await userEvent.click(await screen.findByRole('button', { name: 'Mark as Cooked' }))
  const sheet = await screen.findByRole('dialog', { name: 'Mark as Cooked' })
  await userEvent.click(await within(sheet).findByRole('button', { name: 'Mark as Cooked' }))
  return screen.findByRole('heading', { level: 1, name: 'Cooked, nice one!' })
}
const confirmation = () => document.querySelector<HTMLElement>('.cook-confirmation')!
const toasts = () => document.querySelectorAll('.toast')

beforeEach(() => {
  resolved = false
  vi.stubGlobal('matchMedia', undefined)
})
afterEach(() => vi.unstubAllGlobals())

describe('the Cooked moment', () => {
  it('says "Cooked, nice one!", focuses it, and names the Recipe and the meal', async () => {
    mockApi(routes())
    renderMeal()
    const h1 = await confirmCooked()
    await waitFor(() => expect(h1).toHaveFocus())
    expect(within(confirmation()).getByText('Cauliflower al gorgonzola · Mon Dinner')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Marked as Cooked' })).not.toBeInTheDocument()
  })

  it('says where the Leftover went in its own tile: "1.25 portions kept" / "Planned for Tue Dinner · Use by Thu"', async () => {
    mockApi(routes())
    renderMeal()
    await confirmCooked()
    const tile = confirmation().querySelector<HTMLElement>('[data-status="leftover"]')!
    expect(within(tile).getByText('1.25 portions kept')).toBeInTheDocument()
    expect(within(tile).getByText('Planned for Tue Dinner · Use by Thu')).toBeInTheDocument()
  })

  it('a Leftover nothing is planned for is kept: "1.25 portions kept" / "Use by Thu"', async () => {
    mockApi(routes({ [`POST ${base}/cooked`]: () => ((resolved = true), cooked([], { leftover })) }))
    renderMeal()
    await confirmCooked()
    const tile = confirmation().querySelector<HTMLElement>('[data-status="leftover"]')!
    expect(within(tile).getByText('1.25 portions kept')).toBeInTheDocument()
    expect(within(tile).getByText('Use by Thu')).toBeInTheDocument()
  })

  it('no Leftover recorded: no Leftover tile and no notice', async () => {
    mockApi(routes({ [`POST ${base}/cooked`]: () => ((resolved = true), cooked([])) }))
    renderMeal()
    await confirmCooked()
    expect(confirmation().querySelector('[data-status="leftover"]')).toBeNull()
    expect(confirmation().querySelector('.shortfall-notice')).toBeNull()
  })

  it('never offers Mark as Cooked again, even when the Step view is refreshed as no longer cookable', async () => {
    let calls = 0
    mockApi(routes({ 'GET /api/cook/meals/2026-11-09/2/all': () => (++calls === 1 ? timeline() : { status: 409, json: { error: { code: 'not_cookable', message: 'x' } } }) }))
    renderMeal()
    await confirmCooked()
    expect(screen.queryByRole('button', { name: 'Mark as Cooked' })).not.toBeInTheDocument()
    expect(screen.queryByText('This meal has already been cooked or skipped')).not.toBeInTheDocument()
  })

  it('shows no toast in Cook Mode (the page is the confirmation), also with a shortfall', async () => {
    mockApi(routes())
    renderMeal()
    await confirmCooked()
    await new Promise((r) => setTimeout(r, 100))
    expect(toasts()).toHaveLength(0)
  })
})

describe('ONE shortfall notice', () => {
  it('lists each short Ingredient as a row with its state and detail, in one info tile, and never a danger tile or an alert', async () => {
    mockApi(routes())
    renderMeal()
    await confirmCooked()
    const notices = confirmation().querySelectorAll('.shortfall-notice')
    expect(notices).toHaveLength(1)
    const notice = notices[0] as HTMLElement
    expect(notice).toHaveAttribute('data-status', 'info')
    expect(within(notice).getByText('Stock was short for 3 Ingredients')).toBeInTheDocument()
    const rows = [...notice.querySelectorAll('li.detail-row')].map((r) => [r.querySelector('.detail-row__label')?.textContent, r.querySelector('.detail-row__state')?.textContent, r.querySelector('.detail-row__detail')?.textContent])
    expect(rows).toEqual([
      ['Cauliflower', 'none in Stock', 'The Recipe used 800 g'],
      ['Gorgonzola', 'none in Stock', 'The Recipe used 250 g'],
      ['Chestnut mushrooms', '200 g short', 'The Recipe used 300 g · Stock showed 100 g'],
    ])
    expect(notice.querySelector('.shortfall-notice__foot')).toHaveTextContent('Stock stays where it is. Correct it if some was left.')
    expect(confirmation().querySelector('[data-status="danger"], [data-status="spoil"], [role="alert"]')).toBeNull()
    expect(within(notice).getAllByRole('button')).toHaveLength(2)
  })

  it('Dismiss takes the notice away and leaves Stock alone; the confirmation stays', async () => {
    const api = mockApi(routes())
    renderMeal()
    await confirmCooked()
    await userEvent.click(within(confirmation().querySelector<HTMLElement>('.shortfall-notice')!).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(confirmation().querySelector('.shortfall-notice')).toBeNull())
    expect(api.calls.some((c) => c.path.startsWith('/api/stock'))).toBe(false)
    expect(screen.getByRole('heading', { name: 'Cooked, nice one!' })).toBeInTheDocument()
  })
})

describe('units', () => {
  it('writes the notice\'s amounts in the User\'s unit system, not the server\'s metric text', async () => {
    mockApi(routes({ 'GET /api/me/preferences': { scheme: 'system', accent: '#3f7d58', units: 'imperial' } }))
    renderMeal()
    await confirmCooked()
    const notice = await waitFor(() => {
      const n = confirmation().querySelector<HTMLElement>('.shortfall-notice')
      if (!n || !/oz/.test(n.textContent ?? '')) throw new Error('not in ounces yet')
      return n
    })
    expect(notice).toHaveTextContent('The Recipe used 10.6 oz · Stock showed 3.5 oz')
    expect(notice).not.toHaveTextContent(/300 g/)
  })
})

describe('ONE Correct Stock sheet', () => {
  it('opens once for every short Ingredient: a row each with a Stepper, saves the raised ones only, and says how many', async () => {
    const api = mockApi(routes())
    renderMeal()
    await confirmCooked()
    await userEvent.click(within(confirmation().querySelector<HTMLElement>('.shortfall-notice')!).getByRole('button', { name: 'Correct Stock' }))
    const sheet = await screen.findByRole('dialog', { name: /Correct Stock/ })
    expect(within(sheet).getByText('After cooking Cauliflower al gorgonzola')).toBeInTheDocument()
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(3)
    expect(within(sheet).getByText('The Recipe used 800 g · Stock showed none')).toBeInTheDocument()
    await userEvent.click(within(within(sheet).getByRole('group', { name: 'Gorgonzola left now' })).getByRole('button', { name: /^Increase/ }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.calls.filter((c) => c.method === 'PUT').map((c) => [c.path, c.body])).toEqual([['/api/stock/ingredients/2/total', { total: 10 }]]))
    await waitFor(() => expect(confirmation().querySelector('.shortfall-notice')).toBeNull())
    expect(screen.getByRole('heading', { name: 'Cooked, nice one!' })).toBeInTheDocument()
    expect(await screen.findByText('Stock corrected for 1 Ingredient')).toBeInTheDocument()
  })
})

describe('the way back', () => {
  it('goes back to Today when no place was passed, and Exit goes there too', async () => {
    mockApi(routes())
    renderMeal()
    await confirmCooked()
    expect(screen.queryByRole('button', { name: 'Back to Plan' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back to Today' }))
    expect(await screen.findByText('Home page')).toBeInTheDocument()
  })

  it('goes back to the Plan when Cook Mode was opened from the Plan: the primary says "Back to Plan"', async () => {
    mockApi(routes())
    renderMeal('/plan')
    await confirmCooked()
    expect(screen.queryByRole('button', { name: 'Back to Today' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back to Plan' }))
    expect(await screen.findByText('Plan page')).toBeInTheDocument()
  })

  it('Exit before cooking returns to where Cook Mode was opened from too', async () => {
    mockApi(routes())
    renderMeal('/plan')
    await userEvent.click(await screen.findByRole('button', { name: 'Exit' }))
    expect(await screen.findByText('Plan page')).toBeInTheDocument()
  })

  it('an unknown or foreign place is ignored: back to Today', async () => {
    mockApi(routes())
    renderMeal('//evil.example/plan')
    await confirmCooked()
    expect(screen.getByRole('button', { name: 'Back to Today' })).toBeInTheDocument()
  })
})

describe('Undo Cooked from the confirmation', () => {
  it('is the secondary button next to the way back, named for the meal', async () => {
    mockApi(routes())
    renderMeal()
    await confirmCooked()
    const undo = screen.getByRole('button', { name: 'Undo Cooked for Mon Dinner' })
    expect(undo).toHaveAttribute('data-variant', 'secondary')
    expect(undo).toHaveTextContent('Undo Cooked')
  })

  it('reopens the meal once, takes the confirmation and its notice away and returns to the last Step', async () => {
    const api = mockApi(routes())
    renderMeal()
    await confirmCooked()
    await userEvent.click(screen.getByRole('button', { name: 'Undo Cooked for Mon Dinner' }))
    expect(await screen.findByRole('article', { name: 'Step 1 of 1' })).toBeInTheDocument()
    expect(api.callsTo('POST', `${base}/reopen`)).toHaveLength(1)
    expect(document.querySelector('.cook-confirmation')).toBeNull()
    expect(document.querySelector('.shortfall-notice')).toBeNull()
    expect(screen.getByRole('button', { name: 'Mark as Cooked' })).toBeInTheDocument()
  })

  it('a refused Undo is a warning toast "Nothing was undone" with the reason; the confirmation stays', async () => {
    mockApi(routes({ [`POST ${base}/reopen`]: { status: 409, json: { error: { code: 'leftover_used', message: 'used' } } } }))
    renderMeal()
    await confirmCooked()
    await userEvent.click(screen.getByRole('button', { name: 'Undo Cooked for Mon Dinner' }))
    const toast = await waitFor(() => {
      const t = [...toasts()].find((x) => x.textContent?.includes('Nothing was undone'))
      if (!t) throw new Error('no toast')
      return t as HTMLElement
    })
    expect(toast).toHaveTextContent('Some of the Leftover has been used.')
    expect(toast).toHaveAttribute('data-status', 'warning')
    expect(screen.getByRole('heading', { name: 'Cooked, nice one!' })).toBeInTheDocument()
  })
})

describe('Mark all Cooked', () => {
  const view = (): TimelineView => timelineView({ date: '2026-11-10', mealSlotId: 4 })
  const done = (): TimelineView => ({ ...view(), courses: view().courses.map((c) => ({ ...c, state: 'cooked' as const })), items: [], advance: [] })
  const slotBase = '/api/plan/2026-11-10/4'
  const prev = (courseId: number, courseName: string, recipeName: string): CookPreview => ({
    meal: courseMeal(courseId, courseName, { recipeName, mealSlotId: 4, date: '2026-11-10' }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4,
    leftoverUseBy: '2026-11-13', needs: [],
  })
  let allDone = false

  async function markAll(extra: Record<string, unknown> = {}) {
    allDone = false
    const api = mockApi({
      'GET /api/cook/meals/2026-11-10/4/all': () => (allDone ? done() : view()),
      'GET /api/cook/timers': { now: '2026-11-10T12:00:00Z', timers: [] },
      'GET /api/courses': { courses: [] },
      'GET /api/plan': { ...plan, today: '2026-11-10' },
      [`GET ${slotBase}/1/cook`]: prev(1, 'Main', 'Roast chicken'),
      [`GET ${slotBase}/2/cook`]: prev(2, 'Side', 'Green beans'),
      [`POST ${slotBase}/all/cooked`]: () => {
        allDone = true
        return allCookedResult()
      },
      [`POST ${slotBase}/1/reopen`]: () => {
        allDone = false
        return { meals: [], stockGone: 0 }
      },
      'PUT /api/stock/ingredients/11/total': { ingredient: {}, lots: [] },
      ...extra,
    })
    render(
      <QueryClientProvider client={newQueryClient()}>
        <ToastProvider>
          <ConfirmProvider>
            <MemoryRouter initialEntries={['/cook/meal/2026-11-10/4']}>
              <Routes>
                <Route path="/cook/meal/:date/:slotId" element={<CookScreen />} />
                <Route path="/" element={<p>Home page</p>} />
              </Routes>
            </MemoryRouter>
          </ConfirmProvider>
        </ToastProvider>
      </QueryClientProvider>,
    )
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    for (let i = 0; i < 3; i++) await userEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Mark all Cooked' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark all Cooked' })
    await within(sheet).findByRole('spinbutton', { name: 'Main Leftover portions' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Mark all Cooked' }))
    await screen.findByRole('heading', { level: 1, name: 'Cooked, nice one!' })
    return api
  }

  it('confirms the slot, says where each Leftover went and shows one notice; no toast', async () => {
    await markAll()
    expect(within(confirmation()).getByText('Tue Dinner')).toBeInTheDocument()
    expect(confirmation().querySelectorAll('.shortfall-notice')).toHaveLength(1)
    expect(confirmation().querySelector('.shortfall-notice')).toHaveTextContent('Stock was short for chicken thighs')
    expect(confirmation().querySelector('.shortfall-notice')).toHaveTextContent('Cooking used 400 g · Stock showed 300 g')
    await new Promise((r) => setTimeout(r, 100))
    expect(toasts()).toHaveLength(0)
    expect(confirmation().querySelector('[data-status="danger"], [role="alert"]')).toBeNull()
  })

  it('one Undo for the whole Mark all: "Undo Cooked for all 2 Courses" reopens through the first Course once', async () => {
    const api = await markAll()
    await userEvent.click(screen.getByRole('button', { name: 'Undo Cooked for all 2 Courses' }))
    expect(await screen.findByRole('article', { name: 'Step 1 of 4' })).toBeInTheDocument()
    expect(api.callsTo('POST', `${slotBase}/1/reopen`)).toHaveLength(1)
    expect(api.callsTo('POST', `${slotBase}/all/reopen`)).toHaveLength(0)
    expect(document.querySelector('.shortfall-notice')).toBeNull()
  })

  it('Correct Stock is the same one sheet', async () => {
    const api = await markAll()
    await userEvent.click(within(confirmation().querySelector<HTMLElement>('.shortfall-notice')!).getByRole('button', { name: 'Correct Stock' }))
    const sheet = await screen.findByRole('dialog', { name: /Correct Stock/ })
    await userEvent.click(within(within(sheet).getByRole('group', { name: 'chicken thighs left now' })).getByRole('button', { name: /^Increase/ }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/stock/ingredients/11/total')[0]?.body).toEqual({ total: 10 }))
  })
})
