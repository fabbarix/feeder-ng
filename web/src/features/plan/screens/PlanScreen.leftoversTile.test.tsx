// B9-32 (PC-07, PLAN-19): "Leftovers to use" on the Plan is the same bordered leftover tile as Today. From 1024 px (the `desktop` band, 64 em) it lists
// its rows; below, one summary row ("3 Leftovers", the names, "first Use by Tue") with Show, which opens the Leftovers sheet. A question waiting for
// an answer is never hidden in the summary. TEST-AUTHOR tests. Today is Thursday 2026-11-12.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { leftover } from '../../../lib/leftovers/fixtures'
import type { Leftover } from '../../../lib/leftovers'
import { PlanScreen } from './PlanScreen'
import { meal, mockApi, renderWithProviders, slot } from '../test-utils'
import type { PlanView } from '../types'

afterEach(() => vi.unstubAllGlobals())

const view: PlanView = { today: '2026-11-12', horizonDays: 3, updating: false, slots: [slot({ date: '2026-11-12', mealSlotId: 2, meal: meal({ date: '2026-11-12', mealSlotId: 2, recipeName: 'Roast chicken' }) })] }
const gorgonzola = leftover({ id: 1, recipeId: 21, recipeName: 'Cauliflower al gorgonzola', portions: 2, useBy: '2026-11-17' }) // Tue
const stew = leftover({ id: 2, recipeId: 22, recipeName: 'Slow cooker beef', portions: 3, useBy: '2026-11-19' })
const soup = leftover({ id: 3, recipeId: 23, recipeName: 'Soup', portions: 1, useBy: '2026-11-20' })
const asked = leftover({ id: 4, recipeId: 24, recipeName: 'Chilli', portions: 2, useBy: '2026-11-10', toAnswer: true })

const widthStub = (px: number) =>
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*([\d.]+)em/.exec(query)
    return { matches: min ? px >= Number(min[1]) * 16 : false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }
  })

function setup(width: number, leftovers: Leftover[]) {
  widthStub(width)
  mockApi({ 'GET /api/plan': view, 'GET /api/plan/leftovers': { leftovers }, 'GET /api/storage-places': [], 'GET /api/household/settings': { frozenUseByDays: 90, defaultLeftoverUseByDays: 3 } })
  renderWithProviders(<PlanScreen />)
}
const tile = () => screen.findByRole('region', { name: 'Leftovers to use' })

describe('Leftovers to use: the leftover tile (PLAN-19)', () => {
  it('is a status tile in the leftover tone with the leftover overline, like Today\'s', async () => {
    setup(1440, [gorgonzola, stew])
    const t = await tile()
    expect(t).toHaveAttribute('data-variant', 'status')
    expect(t).toHaveAttribute('data-status', 'leftover')
    expect(t.querySelector('.tile__overline svg')).not.toBeNull()
  })

  it('sits in the same grid as the Couldn\'t plan tile (one BentoGrid min="wide": two-up from 1024, stacked below)', async () => {
    widthStub(1440)
    mockApi({ 'GET /api/plan': { ...view, slots: [...view.slots, slot({ date: '2026-11-13', mealSlotId: 2, meal: null, unfilled: { reason: 'no_attendance', slotRuleClaimed: false, eliminated: { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 } } })] }, 'GET /api/plan/leftovers': { leftovers: [gorgonzola] }, 'GET /api/storage-places': [], 'GET /api/household/settings': {} })
    renderWithProviders(<PlanScreen />)
    const couldnt = await screen.findByRole('region', { name: "Couldn't plan" })
    const leftovers = await tile()
    expect(couldnt.parentElement).toBe(leftovers.parentElement)
    expect(couldnt.parentElement).toHaveClass('bento-grid')
    expect(couldnt.parentElement).toHaveAttribute('data-min', 'wide')
  })
})

describe('at 1024 and wider it lists its rows', () => {
  it('each Leftover is a row; there is no summary and no Show', async () => {
    setup(1280, [gorgonzola, stew, soup])
    const t = await tile()
    expect(within(t).getByText('Cauliflower al gorgonzola')).toBeInTheDocument()
    expect(within(t).getByText('Slow cooker beef')).toBeInTheDocument()
    expect(within(t).queryByText('3 Leftovers')).not.toBeInTheDocument()
    expect(within(t).queryByRole('button', { name: /^Show / })).not.toBeInTheDocument()
  })
})

describe('below 1024 it is one summary row', () => {
  it('"3 Leftovers", the names with the first Use-by, and Show', async () => {
    setup(834, [stew, gorgonzola, soup])
    const t = await tile()
    expect(within(t).getByText('3 Leftovers')).toBeInTheDocument()
    expect(within(t).getByText('Cauliflower al gorgonzola, Slow cooker beef, Soup · first Use by Tue')).toBeInTheDocument()
    expect(within(t).getByRole('button', { name: 'Show 3 Leftovers' })).toHaveAttribute('data-variant', 'secondary')
    expect(within(t).queryByText('Slow cooker beef', { selector: '.list-row__title' })).not.toBeInTheDocument() // the rows are not listed
  })

  it('one Leftover reads "1 Leftover"', async () => {
    setup(375, [gorgonzola])
    expect(within(await tile()).getByText('1 Leftover')).toBeInTheDocument()
  })

  it('Show opens the Leftovers sheet with the rows (and their menus); the sheet is named "Leftovers to use"', async () => {
    setup(834, [stew, gorgonzola])
    await userEvent.click(within(await tile()).getByRole('button', { name: 'Show 2 Leftovers' }))
    const sheet = await screen.findByRole('dialog', { name: 'Leftovers to use' })
    expect(within(sheet).getByText('Cauliflower al gorgonzola')).toBeInTheDocument()
    expect(within(sheet).getByText('Slow cooker beef')).toBeInTheDocument()
  })

  it('a question waiting for an answer is never hidden in the summary: it stays in the tile with its answers', async () => {
    setup(834, [asked, gorgonzola, stew])
    const t = await tile()
    expect(within(t).getByText(/Chilli was to be used by Tue/)).toBeInTheDocument()
    expect(within(t).getByText('2 Leftovers')).toBeInTheDocument() // the summary counts the rest
  })
})
