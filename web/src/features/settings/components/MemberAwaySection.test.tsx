// B9-46 (SET-16): the Away section of the Member sheet: each current or coming Away is a row (key, state, detail) that opens the Away
// sheet; "Add an Away" opens it with this Member chosen; none: "Not away on any day." Today is Sun 15 Nov 2026.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Away } from '../../plan/types'
import { mockApi, renderWithProviders } from '../test-utils'
import { marco } from './fixtures'
import { MemberAwaySection } from './MemberAwaySection'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))
beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
})

const SLOTS = [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) =>
  [['Breakfast', '08:30', 1], ['Lunch', '13:00', 2], ['Dinner', '19:00', 3]].map(([name, time, n]) => ({ id: weekday * 10 + (n as number), weekday, name, time, attendance: [], portionsNeeded: 3 })),
)
const away = (over: Partial<Away> = {}): Away => ({ id: 1, memberId: 2, memberName: 'Marco', from: '2026-11-19', fromMealSlotId: null, through: '2026-11-26', throughMealSlotId: null, started: false, ...over })
const routes = (aways: Away[]) =>
  mockApi({
    'GET /api/members': [marco],
    'GET /api/meal-slots': SLOTS,
    'GET /api/plan': { today: '2026-11-15', horizonDays: 7, updating: false, slots: [], away: [] },
    'GET /api/members/2/away': aways,
    'PATCH /api/away/1?dryRun=1': { slotsWithout: 0, mealsChanged: 0, days: [], beyondHorizon: null },
    'POST /api/members/2/away?dryRun=1': { slotsWithout: 0, mealsChanged: 0, days: [], beyondHorizon: null },
  })

describe('MemberAwaySection', () => {
  it('a title-3 "Away", then a list named "Marco\'s Aways" with a row per Away, soonest first', async () => {
    routes([away(), away({ id: 2, from: '2026-12-01', through: null })])
    renderWithProviders(<MemberAwaySection member={marco} />)
    expect(await screen.findByRole('heading', { name: 'Away', level: 3 })).toBeInTheDocument()
    const rows = within(await screen.findByRole('list', { name: "Marco's Aways" })).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Thu 19 – Thu 26 Nov')
    expect(rows[0]).toHaveTextContent('in 4 days')
    expect(rows[0]).toHaveTextContent('24 Meal Slots · whole days')
    expect(rows[1]).toHaveTextContent('From Tue 1 Dec')
    expect(rows[1]).toHaveTextContent('in 16 days')
    expect(rows[1]).toHaveTextContent('No last day yet')
  })

  it('each row is a button named "Away <range>, <state>, <detail>" that opens a dialog', async () => {
    routes([away()])
    renderWithProviders(<MemberAwaySection member={marco} />)
    const rowButton = await screen.findByRole('button', { name: 'Away Thu 19 – Thu 26 Nov, in 4 days, 24 Meal Slots · whole days' })
    expect(rowButton).toHaveAttribute('aria-haspopup', 'dialog')
    await userEvent.click(rowButton)
    const dialog = await screen.findByRole('dialog', { name: /Marco is away/ })
    expect(dialog.querySelector('.sheet__context')).toHaveTextContent('Thu 19 – Thu 26 Nov')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(rowButton).toHaveFocus()) // focus returns to what opened it
  })

  it('w6a: an Away removed from its sheet leaves the list, and focus goes to "Add an Away" (its row is gone)', async () => {
    let list = [away()]
    mockApi({
      'GET /api/members': [marco],
      'GET /api/meal-slots': SLOTS,
      'GET /api/plan': { today: '2026-11-15', horizonDays: 7, updating: false, slots: [], away: [] },
      'GET /api/members/2/away': () => list,
      'PATCH /api/away/1?dryRun=1': { slotsWithout: 0, mealsChanged: 0, days: [], beyondHorizon: null },
      'DELETE /api/away/1': () => {
        list = []
        return { json: { id: 1, changes: [], undoToken: 'tok' } }
      },
    })
    renderWithProviders(<MemberAwaySection member={marco} />)
    await userEvent.click(await screen.findByRole('button', { name: /^Away Thu 19 – Thu 26 Nov/ }))
    const dialog = await screen.findByRole('dialog', { name: /Marco is away/ })
    await userEvent.click(within(dialog).getByRole('button', { name: /^Remove Away/ }))
    expect(await screen.findByText('Not away on any day.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add an Away' })).toHaveFocus())
  })

  it('"Add an Away" is an outlined secondary button; it opens the sheet with Marco chosen and no Who pills', async () => {
    routes([away()])
    renderWithProviders(<MemberAwaySection member={marco} />)
    const add = await screen.findByRole('button', { name: 'Add an Away' })
    expect(add).toHaveAttribute('data-variant', 'secondary')
    await userEvent.click(add)
    const dialog = await screen.findByRole('dialog', { name: /Marco is away/ })
    expect(dialog.querySelector('.sheet__context')).toHaveTextContent('New Away')
    expect(within(dialog).queryByRole('radiogroup', { name: 'Who' })).toBeNull()
  })

  it('no Away: "Not away on any day." and the button', async () => {
    routes([])
    renderWithProviders(<MemberAwaySection member={marco} />)
    expect(await screen.findByText('Not away on any day.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add an Away' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: "Marco's Aways" })).toBeNull()
  })

  it('an Away that has started reads "now"', async () => {
    routes([away({ from: '2026-11-13', through: '2026-11-16', started: true })])
    renderWithProviders(<MemberAwaySection member={marco} />)
    expect(await screen.findByRole('button', { name: /^Away Fri 13 – Mon 16 Nov, now,/ })).toBeInTheDocument()
  })
})
