// B5-LOW wiring (ADR 0012): Today's Leftovers tile asks before waste, previews the Planned Meals an action would replan,
// and opens the Had it / Threw it out / Freeze it sheets from each row.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { friDinner, friLunch, frozenChilli, leftover } from '../../../lib/leftovers/fixtures'
import type { Leftover } from '../../../lib/leftovers'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { TodayScreen } from './TodayScreen'

const h = vi.hoisted(() => ({ leftovers: [] as unknown[] }))

vi.mock('../seams', () => ({
  useScanSessionActive: () => false,
  useTodayPlan: () => ({ hasNextMeal: false, toConfirm: 0, couldntPlan: 0, leftovers: h.leftovers.length, loading: false }),
  useTodayStock: () => ({ spoiled: 0, useSoon: [], loading: false }),
  useTodayTileData: () => ({
    now: new Date('2026-11-12T10:00:00Z'), nextSlot: null, toConfirm: [], couldntPlan: [], leftovers: h.leftovers, planToday: '2026-11-12',
    spoiled: [], stockToday: '2026-11-12', system: 'metric', useSoon: [], throwOut: vi.fn(), keep: vi.fn(), planLoading: false, stockLoading: false,
  }),
  ShoppingListSeam: () => createElement('p', null, 'The Shopping List'),
}))

// Today is Thursday 2026-11-12. Chilli (3) was to be used by Tuesday; Soup (4) is still good.
const asked = leftover({ id: 3, recipeName: 'Chilli', portions: 2, useBy: '2026-11-10', toAnswer: true })
const soup = leftover({ id: 4, recipeId: 11, recipeName: 'Soup', portions: 2, useBy: '2026-11-14' })
const QUESTION = "Chilli was to be used by Tue. Had it, threw it out, or wasn't there?"
const quiet = { replanned: [] }

const places = [
  { id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true },
  { id: 2, name: 'Garage Freezer', kind: 'freezer', default: false },
]

/** The reads the tile and its sheets need, plus any writes a test adds. `leftovers` is what GET /api/plan/leftovers answers. */
function setup(leftovers: Leftover[], extra: Record<string, unknown> = {}) {
  h.leftovers = leftovers
  const api = mockApi({
    'GET /api/today/advance-steps': { steps: [] },
    'GET /api/today/streak': { days: 0 },
    'GET /api/plan/leftovers': () => ({ leftovers: h.leftovers }),
    'GET /api/storage-places': places,
    'GET /api/household/settings': { frozenUseByDays: 90, defaultLeftoverUseByDays: 3 },
    'GET /api/recipes/10': { id: 10, frozenUseByDays: null, leftoverUseByDays: null },
    'GET /api/recipes/11': { id: 11, frozenUseByDays: null, leftoverUseByDays: null },
    ...extra,
  } as Parameters<typeof mockApi>[0])
  renderWithProviders(createElement(TodayScreen))
  return api
}
const posts = (api: ReturnType<typeof mockApi>) => api.calls.filter((c) => c.method === 'POST')

afterEach(() => {
  h.leftovers = []
  vi.unstubAllGlobals()
})

describe('Today: a Leftover past its Use-by waits for an answer', () => {
  it('shows the question with Had it, Threw it out and Wasn\'t there, and sends nothing on its own', async () => {
    const api = setup([asked, soup])
    const group = await screen.findByRole('group', { name: QUESTION })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Had it', 'Threw it out', "Wasn't there"])
    // Never discarded automatically: the tile only asks.
    await new Promise((r) => setTimeout(r, 50))
    expect(posts(api)).toEqual([])
    expect(screen.getByText(QUESTION)).toBeInTheDocument()
  })

  it('does not offer a row menu on the question, and keeps a Leftover still good as a normal row', async () => {
    setup([asked, soup])
    await screen.findByText(QUESTION)
    expect(screen.queryByRole('button', { name: 'Actions for Chilli' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Actions for Soup' })).toBeInTheDocument()
    expect(screen.getByText('2 portions · Use by Sat')).toBeInTheDocument()
  })

  it('a frozen Leftover that is to answer asks on Today with its Storage Place; a frozen one that is not stays on the Pantry', async () => {
    setup([frozenChilli({ id: 5, recipeName: 'Stew', useBy: '2026-11-10', toAnswer: true }), frozenChilli({ id: 6, recipeName: 'Curry' }), soup])
    expect(await screen.findByTestId('leftover-question-5')).toHaveTextContent('Garage Freezer')
    expect(screen.queryByText('Curry')).toBeNull()
  })
})

describe('Today: answering', () => {
  it('previews with the dry run, and answers straight away when nothing would be replanned', async () => {
    const api = setup([asked, soup], {
      'POST /api/plan/leftovers/3/had-it?dryRun=1': quiet,
      'POST /api/plan/leftovers/3/answer': { status: 204 },
    })
    await screen.findByText(QUESTION)
    // The answer is a dry run of "all of it" (had-it with every portion left): the same Planned Meals lose out.
    api.calls.length = 0
    await userEvent.click(screen.getByRole('button', { name: 'Had it' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/leftovers/3/answer')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/plan/leftovers/3/had-it?dryRun=1')[0]?.body).toEqual({ portions: 2 })
    expect(api.callsTo('POST', '/api/plan/leftovers/3/answer')[0]?.body).toEqual({ answer: 'had_it' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByText('Noted: Chilli was had.')).toBeInTheDocument()
  })

  it('asks first when the answer would replan a Planned Meal, naming it, and answers only after a yes', async () => {
    const api = setup([asked, soup], {
      'POST /api/plan/leftovers/3/had-it?dryRun=1': { replanned: [friLunch, friDinner] },
      'POST /api/plan/leftovers/3/answer': { status: 204 },
    })
    await screen.findByText(QUESTION)
    await userEvent.click(screen.getByRole('button', { name: "Wasn't there" }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Fri Lunch was going to have it; it is planned again.')).toBeInTheDocument()
    expect(within(dialog).getByText('Fri Dinner was going to have it; it is planned again.')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/plan/leftovers/3/answer')).toHaveLength(0)
    await userEvent.click(within(dialog).getByRole('button', { name: "Wasn't there" }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/leftovers/3/answer')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/plan/leftovers/3/answer')[0]?.body).toEqual({ answer: 'wasnt_there' })
  })

  it('Cancel leaves the question and sends nothing', async () => {
    const api = setup([asked, soup], {
      'POST /api/plan/leftovers/3/had-it?dryRun=1': { replanned: [friLunch] },
      'POST /api/plan/leftovers/3/answer': { status: 204 },
    })
    await screen.findByText(QUESTION)
    await userEvent.click(screen.getByRole('button', { name: 'Threw it out' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.callsTo('POST', '/api/plan/leftovers/3/answer')).toHaveLength(0)
    expect(screen.getByText(QUESTION)).toBeInTheDocument()
  })

  it('answers when the dry run fails: the question must not get stuck', async () => {
    const api = setup([asked, soup], {
      'POST /api/plan/leftovers/3/had-it?dryRun=1': { status: 500, json: { error: { code: 'x', message: 'boom' } } },
      'POST /api/plan/leftovers/3/answer': { status: 204 },
    })
    await screen.findByText(QUESTION)
    await userEvent.click(screen.getByRole('button', { name: 'Had it' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/leftovers/3/answer')).toHaveLength(1))
  })

  it('refreshes the list after the answer, so the question goes', async () => {
    setup([asked, soup], {
      'POST /api/plan/leftovers/3/had-it?dryRun=1': quiet,
      'POST /api/plan/leftovers/3/answer': () => {
        h.leftovers = [soup]
        return { status: 204 }
      },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Had it' }))
    await waitFor(() => expect(screen.queryByText(QUESTION)).toBeNull())
    expect(screen.getByText('Soup')).toBeInTheDocument()
  })
})

describe('Today: the row menu', () => {
  const menu = async (name: string) => {
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Soup' }))
    await userEvent.click(await screen.findByRole('menuitem', { name }))
  }

  it('offers Had it, Threw it out and Freeze it', async () => {
    setup([asked, soup])
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Soup' }))
    expect((await screen.findAllByRole('menuitem')).map((m) => m.textContent)).toEqual(['Had it', 'Threw it out', 'Freeze it'])
  })

  it('Freeze it opens its sheet, names the Planned Meals it would replan, and posts only on confirm', async () => {
    const api = setup([asked, soup], {
      'POST /api/plan/leftovers/4/freeze?dryRun=1': { replanned: [friDinner] },
      'POST /api/plan/leftovers/4/freeze': { frozen: frozenChilli({ id: 9, recipeName: 'Soup', useBy: '2027-02-10' }), left: null, replanned: [friDinner] },
    })
    await menu('Freeze it')
    const sheet = await screen.findByRole('dialog', { name: 'Freeze Soup' })
    expect(await within(sheet).findByText('Fri Dinner was going to have it; it is planned again.')).toBeInTheDocument()
    expect(within(sheet).getByText('Use by 10 Feb in the freezer (90 days)')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/plan/leftovers/4/freeze')).toHaveLength(0)
    await userEvent.click(within(sheet).getByRole('button', { name: 'Freeze it' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/leftovers/4/freeze')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/plan/leftovers/4/freeze')[0]?.body).toEqual({ storagePlaceId: 2, portions: 2 })
    expect(await screen.findByText('Soup is in Garage Freezer. Use by 10 Feb.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Freeze Soup' })).toBeNull())
  })

  it('Cancel on the sheet sends nothing', async () => {
    const api = setup([asked, soup], { 'POST /api/plan/leftovers/4/freeze?dryRun=1': quiet })
    await menu('Freeze it')
    const sheet = await screen.findByRole('dialog', { name: 'Freeze Soup' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Freeze Soup' })).toBeNull())
    expect(posts(api).filter((c) => !c.path.includes('dryRun'))).toEqual([])
  })

  it('Threw it out asks for the portions, warns about waste and posts them', async () => {
    const api = setup([asked, soup], {
      'POST /api/plan/leftovers/4/threw-out?dryRun=1': quiet,
      'POST /api/plan/leftovers/4/threw-out': { leftover: { ...soup, portions: 0 }, replanned: [] },
    })
    await menu('Threw it out')
    const sheet = await screen.findByRole('dialog', { name: 'Throw out Soup?' })
    expect(within(sheet).getByText('This counts as waste: the zero-waste streak starts again today.')).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Threw it out' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/leftovers/4/threw-out')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/plan/leftovers/4/threw-out')[0]?.body).toEqual({ portions: 2 })
  })

  it('a failed action keeps the sheet open and says so', async () => {
    setup([asked, soup], {
      'POST /api/plan/leftovers/4/had-it?dryRun=1': quiet,
      'POST /api/plan/leftovers/4/had-it': { status: 422, json: { error: { code: 'portions_invalid', message: 'x' } } },
    })
    await menu('Had it')
    const sheet = await screen.findByRole('dialog', { name: 'How many portions of Soup did you have?' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Had it' }))
    expect(await screen.findByText('There are not that many portions of Soup left.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'How many portions of Soup did you have?' })).toBeInTheDocument()
  })
})
