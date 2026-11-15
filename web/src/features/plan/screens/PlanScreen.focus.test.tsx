// B9-32 (hand-back of B9-26, PC-01, A11Y-07): focus moves on the Plan. Closing Review returns focus to the edited row; after Undo focus goes
// to the restored row, but only when focus was in the toast. The rows give a stable target: li[data-row-key="date/slot/course"] .list-row__target.
// 2026-11-14 is a Saturday. TEST-AUTHOR tests: fail until the rows carry data-row-key and the screen moves focus.
import { onlineManager } from '@tanstack/react-query'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/sse', () => ({ connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }) }))

import { ME, VIEW, dinnerChange, findToastWith, lunchChange, pressInToast } from '../test-utils.undo'
import { meal, mockApi, renderWithProviders } from '../test-utils'
import { PlanScreen } from './PlanScreen'

beforeEach(() => void vi.stubGlobal('EventSource', class {}))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  onlineManager.setOnline(true)
})

const alternatives = { alternatives: [{ recipeId: 21, recipeName: 'Pizza', batches: 1, newLeftoverPortions: 0, newLeftoverUseBy: '2026-11-20', score: 1, why: [] }] }
const written = { ...meal({ date: '2026-11-17', mealSlotId: 1, recipeId: 21, pinned: true }), changes: [lunchChange, dinnerChange], undoToken: 'tok-1' }
const base = {
  'GET /api/plan': VIEW,
  'GET /api/me': ME,
  'GET /api/plan/2026-11-17/1/1/alternatives': alternatives,
  'PUT /api/plan/2026-11-17/1/1': written,
  'POST /api/plan/restore': { changes: [] },
}
const target = (k: string) => document.querySelector(`li[data-row-key="${k}"] .list-row__target`) as HTMLElement | null

async function swapPancakes() {
  const tile = (await screen.findByRole('heading', { name: /^Tue 17/ })).closest('article') as HTMLElement
  await userEvent.click(within(tile).getByRole('button', { name: /^Swap Pancakes, Tue 17 Breakfast$/ }))
  await userEvent.click(await screen.findByRole('button', { name: 'Pizza' }))
  return findToastWith('Swapped Tue Breakfast')
}

describe('PlanScreen: a stable focus target on every Course row', () => {
  it('each row is li[data-row-key="<date>/<Meal Slot id>/<Course id>"] and has one .list-row__target', async () => {
    mockApi(base)
    renderWithProviders(<PlanScreen />)
    await screen.findByRole('heading', { name: /^Tue 17/ })
    expect(target('2026-11-17/1/1')).not.toBeNull()
    expect(target('2026-11-18/3/3')).not.toBeNull() // the Dessert Course of Wed's Dinner
    const keys = [...document.querySelectorAll('li[data-row-key]')].map((l) => l.getAttribute('data-row-key'))
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('PlanScreen: focus after Review', () => {
  it('Keep the changes closes What changed and puts focus on the edited row', async () => {
    mockApi(base)
    renderWithProviders(<PlanScreen />)
    await pressInToast(await swapPancakes(), 'Review 2 changed meals')
    const sheet = await screen.findByRole('dialog', { name: /What changed/ })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Keep the changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /What changed/ })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(target('2026-11-17/1/1')))
  })

  it('Escape closes it the same way: focus lands on the edited row, not on the page', async () => {
    mockApi(base)
    renderWithProviders(<PlanScreen />)
    await pressInToast(await swapPancakes(), 'Review 2 changed meals')
    await screen.findByRole('dialog', { name: /What changed/ })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /What changed/ })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(target('2026-11-17/1/1')))
  })

  it('Undo all in the sheet closes it and puts focus on the restored (edited) row', async () => {
    mockApi(base)
    renderWithProviders(<PlanScreen />)
    await pressInToast(await swapPancakes(), 'Review 2 changed meals')
    await userEvent.click(within(await screen.findByRole('dialog', { name: /What changed/ })).getByRole('button', { name: 'Undo all' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /What changed/ })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(target('2026-11-17/1/1')))
  })
})

describe('PlanScreen: focus after Undo in the toast', () => {
  it('when focus was in the toast (the person pressed Undo), it goes to the restored row', async () => {
    const api = mockApi(base)
    renderWithProviders(<PlanScreen />)
    await pressInToast(await swapPancakes(), 'Undo the Swap and 2 other changes')
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/restore')).toHaveLength(1))
    await waitFor(() => expect(document.activeElement).toBe(target('2026-11-17/1/1')))
  })

  it('when focus was elsewhere (Regenerate had it), Undo does not steal it', async () => {
    const api = mockApi(base)
    renderWithProviders(<PlanScreen />)
    const toast = await swapPancakes()
    const regenerate = screen.getByRole('button', { name: 'Regenerate' })
    regenerate.focus()
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo the Swap and 2 other changes' })) // a click that does not move focus
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/restore')).toHaveLength(1))
    await new Promise((r) => setTimeout(r, 50))
    expect(document.activeElement).toBe(regenerate)
  })
})
