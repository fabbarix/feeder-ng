// B5-LOW wiring (ADR 0012): the Plan lists Leftovers too, asks before waste and previews what an action would replan.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { friLunch, frozenChilli, leftover } from '../../../lib/leftovers/fixtures'
import type { Leftover } from '../../../lib/leftovers'
import { PlanScreen } from './PlanScreen'
import { meal, mockApi, renderWithProviders, slot } from '../test-utils'
import type { PlanView } from '../types'

afterEach(() => vi.unstubAllGlobals())

const view = (): PlanView => ({
  today: '2026-11-12', horizonDays: 3, updating: false,
  slots: [slot({ date: '2026-11-12', mealSlotId: 2, meal: meal({ date: '2026-11-12', mealSlotId: 2, recipeId: 7, recipeName: 'Roast chicken' }) })],
})
const asked = leftover({ id: 3, recipeName: 'Chilli', portions: 2, useBy: '2026-11-10', toAnswer: true })
const soup = leftover({ id: 4, recipeId: 11, recipeName: 'Soup', portions: 2, useBy: '2026-11-14' })
const QUESTION = "Chilli was to be used by Tue. Had it, threw it out, or wasn't there?"

function setup(leftovers: Leftover[], extra: Record<string, unknown> = {}) {
  let current = leftovers
  const api = mockApi({
    'GET /api/plan': view(),
    'GET /api/plan/leftovers': () => ({ leftovers: current }),
    'GET /api/storage-places': [{ id: 2, name: 'Garage Freezer', kind: 'freezer', default: false }],
    'GET /api/household/settings': { frozenUseByDays: 90, defaultLeftoverUseByDays: 3 },
    'GET /api/recipes/11': { id: 11, frozenUseByDays: null, leftoverUseByDays: null },
    ...extra,
  } as Parameters<typeof mockApi>[0])
  renderWithProviders(<PlanScreen />)
  return { api, set: (next: Leftover[]) => { current = next } }
}

describe('PlanScreen: Leftovers', () => {
  it('lists the Leftovers to use, soonest first, and the question for one past its Use-by', async () => {
    setup([soup, asked, frozenChilli({ id: 5 })])
    expect(await screen.findByRole('heading', { name: 'Leftovers to use' })).toBeInTheDocument()
    expect(screen.getByText(QUESTION)).toBeInTheDocument()
    expect(screen.getByText('2 portions · Use by Sat')).toBeInTheDocument()
    expect(screen.queryByText('Garage Freezer')).toBeNull() // a frozen Leftover that is not to answer lives on the Pantry
  })

  it('shows no Leftovers section without Leftovers', async () => {
    setup([])
    await screen.findByRole('heading', { name: 'Today' })
    expect(screen.queryByRole('heading', { name: 'Leftovers to use' })).toBeNull()
  })

  it('never answers on its own', async () => {
    const { api } = setup([asked])
    await screen.findByText(QUESTION)
    await new Promise((r) => setTimeout(r, 50))
    expect(api.calls.filter((c) => c.method === 'POST')).toEqual([])
  })

  it('asks first when the answer would replan, then answers and refreshes', async () => {
    const { api, set } = setup([asked, soup], {
      'POST /api/plan/leftovers/3/had-it?dryRun=1': { replanned: [friLunch] },
      'POST /api/plan/leftovers/3/answer': { status: 204 },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Threw it out' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Fri Lunch was going to have it; it is planned again.')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/plan/leftovers/3/answer')).toHaveLength(0)
    set([soup])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Threw it out' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/leftovers/3/answer')[0]?.body).toEqual({ answer: 'threw_out' }))
    await waitFor(() => expect(screen.queryByText(QUESTION)).toBeNull())
  })

  it('answers at once when nothing would be replanned', async () => {
    const { api } = setup([asked], {
      'POST /api/plan/leftovers/3/had-it?dryRun=1': { replanned: [] },
      'POST /api/plan/leftovers/3/answer': { status: 204 },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Had it' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/leftovers/3/answer')).toHaveLength(1))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the row menu opens the Had it sheet with the dry run notes', async () => {
    setup([soup], { 'POST /api/plan/leftovers/4/had-it?dryRun=1': { replanned: [friLunch] } })
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Soup' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Had it' }))
    const sheet = await screen.findByRole('dialog', { name: 'How many portions of Soup did you have?' })
    expect(await within(sheet).findByText('Fri Lunch was going to have it; it is planned again.')).toBeInTheDocument()
  })
})
