// B5-BOW: Bought Planned Meals on the Plan: the chip, the sheet line, the Regenerate confirm and the Swap note.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanScreen } from './PlanScreen'
import { meal, mockApi, renderWithProviders, slot } from '../test-utils'
import type { PlanView } from '../types'

afterEach(() => vi.unstubAllGlobals())

const bought = { ingredients: [{ id: 1, name: 'chicken thighs' }, { id: 2, name: 'cream' }] }
const view = (): PlanView => ({
  today: '2026-11-09', horizonDays: 3, updating: false,
  slots: [
    slot({ date: '2026-11-09', mealSlotId: 2, meal: meal({ date: '2026-11-09', mealSlotId: 2, recipeId: 7, recipeName: 'Roast chicken', bought }) }),
    slot({ date: '2026-11-10', mealSlotId: 3, meal: meal({ date: '2026-11-10', mealSlotId: 3, recipeId: 8, recipeName: 'Stew' }) }),
  ],
})
const dryRun = {
  replaces: 2,
  bought: [{ date: '2026-11-10', mealSlotName: 'Dinner', courseName: 'Main', recipeName: 'Roast chicken', ingredients: ['chicken thighs', 'cream'] }],
}

const tile = async (name: string) => ((await screen.findByRole('heading', { name })).closest('article') as HTMLElement)
const openSheet = async (day: string, recipe: string) => {
  await userEvent.click(within(await tile(day)).getByRole('button', { name: new RegExp(recipe) }))
  return screen.findByRole('dialog', { name: recipe })
}

describe('PlanScreen: Bought', () => {
  it('shows the Bought chip on the tile of a Bought meal, and none on the other', async () => {
    mockApi({ 'GET /api/plan': view() })
    renderWithProviders(<PlanScreen />)
    expect(within(await tile('Today')).getByText('Bought')).toBeInTheDocument()
    expect(within(await tile('Tomorrow')).queryByText('Bought')).not.toBeInTheDocument()
  })

  it('the sheet explains what was bought', async () => {
    mockApi({ 'GET /api/plan': view() })
    renderWithProviders(<PlanScreen />)
    const sheet = await openSheet('Today', 'Roast chicken')
    expect(within(sheet).getByText('Bought for it: chicken thighs, cream. Automatic plan changes leave it as it is.')).toBeInTheDocument()
  })

  it('Swap notes what stays in Stock', async () => {
    mockApi({ 'GET /api/plan': view(), 'GET /api/plan/2026-11-09/2/1/alternatives': { alternatives: [] } })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(within(await tile('Today')).getByRole('button', { name: 'Swap' }))
    expect(await screen.findByText('You bought chicken thighs, cream for this; it stays in Stock.')).toBeInTheDocument()
  })
})

describe('PlanScreen: Regenerate names Bought Planned Meals', () => {
  it('fetches the dry run when the confirm opens and lists the Bought meals under the count', async () => {
    const api = mockApi({ 'GET /api/plan': view(), 'POST /api/plan/regenerate?dryRun=1': dryRun, 'POST /api/plan/regenerate': undefined })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Regenerate' }))
    const dialog = await screen.findByRole('dialog', { name: 'Regenerate the plan?' })
    await waitFor(() => expect(dialog).toHaveTextContent('Among them, these have Ingredients you already bought:'))
    expect(dialog).toHaveTextContent('Tue Dinner · Roast chicken (chicken thighs, cream).')
    expect(dialog).toHaveTextContent('unpinned Planned Meals will change.')
    expect(api.callsTo('POST', '/api/plan/regenerate?dryRun=1')).toHaveLength(1)
    expect(api.callsTo('POST', '/api/plan/regenerate')).toHaveLength(0) // the dry run writes nothing; the real POST waits for a yes
  })

  it('Regenerate in the dialog posts the real route once', async () => {
    const api = mockApi({ 'GET /api/plan': view(), 'POST /api/plan/regenerate?dryRun=1': dryRun, 'POST /api/plan/regenerate': undefined })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Regenerate' }))
    const dialog = await screen.findByRole('dialog', { name: 'Regenerate the plan?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Regenerate' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/regenerate')).toHaveLength(1))
  })

  it('a dry run with nothing Bought adds no intro', async () => {
    mockApi({ 'GET /api/plan': view(), 'POST /api/plan/regenerate?dryRun=1': { replaces: 2, bought: [] } })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Regenerate' }))
    const dialog = await screen.findByRole('dialog', { name: 'Regenerate the plan?' })
    expect(dialog).not.toHaveTextContent('already bought')
  })

  it('a failed dry run still asks, with the plain count', async () => {
    mockApi({ 'GET /api/plan': view(), 'POST /api/plan/regenerate?dryRun=1': { status: 500, json: { error: { code: 'x', message: 'boom' } } } })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Regenerate' }))
    const dialog = await screen.findByRole('dialog', { name: 'Regenerate the plan?' })
    expect(dialog).toHaveTextContent('unpinned Planned Meals will change.')
    expect(dialog).not.toHaveTextContent('already bought')
  })
})

describe('PlanScreen: Regenerate waits for the dry run', () => {
  /** Holds the dry-run answer until release() so the waiting state can be seen. */
  function gated() {
    const api = mockApi({ 'GET /api/plan': view(), 'POST /api/plan/regenerate?dryRun=1': dryRun, 'POST /api/plan/regenerate': undefined })
    const real = globalThis.fetch
    let release = () => {}
    const gate = new Promise<void>((r) => (release = r))
    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
      if (input === '/api/plan/regenerate?dryRun=1') await gate
      return real(input, init)
    })
    return { api, release }
  }

  it('shows the button loading while the dry run runs', async () => {
    const { release } = gated()
    renderWithProviders(<PlanScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Regenerate' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Regenerate' })).toHaveAttribute('aria-busy', 'true'))
    expect(screen.queryByRole('dialog', { name: 'Regenerate the plan?' })).not.toBeInTheDocument()
    release()
    expect(await screen.findByRole('dialog', { name: 'Regenerate the plan?' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Regenerate' })).not.toHaveAttribute('aria-busy'))
  })

  it('two quick taps make one dry-run call and open one dialog', async () => {
    const { api, release } = gated()
    renderWithProviders(<PlanScreen />)
    const button = await screen.findByRole('button', { name: 'Regenerate' })
    await userEvent.click(button)
    await userEvent.click(button)
    release()
    await screen.findByRole('dialog', { name: 'Regenerate the plan?' })
    expect(api.callsTo('POST', '/api/plan/regenerate?dryRun=1')).toHaveLength(1)
    expect(screen.getAllByRole('dialog', { name: 'Regenerate the plan?' })).toHaveLength(1)
  })
})

describe('PlanScreen: the Regenerate confirm count', () => {
  it('uses the dry run count when it succeeds', async () => {
    mockApi({ 'GET /api/plan': view(), 'POST /api/plan/regenerate?dryRun=1': { replaces: 5, bought: [] } })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Regenerate' }))
    expect(await screen.findByRole('dialog', { name: 'Regenerate the plan?' })).toHaveTextContent('5 unpinned Planned Meals will change.')
  })

  it('falls back to the count from the plan when the dry run fails', async () => {
    mockApi({ 'GET /api/plan': view(), 'POST /api/plan/regenerate?dryRun=1': { status: 500, json: { error: { code: 'x', message: 'boom' } } } })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Regenerate' }))
    expect(await screen.findByRole('dialog', { name: 'Regenerate the plan?' })).toHaveTextContent('2 unpinned Planned Meals will change.')
  })
})
