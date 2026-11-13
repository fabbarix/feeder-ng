// Round 2: Today with the real Leftovers seam (not stubbed). The tile and the Leftover flow read the same query, so the tile
// keeps its rows, a Planned Meal's "Choose a Recipe" opens, and a question can be answered.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { leftover } from '../../../lib/leftovers/fixtures'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { TodayScreen } from './TodayScreen'

afterEach(() => vi.unstubAllGlobals())

const asked = leftover({ id: 3, recipeName: 'Chilli', portions: 2, useBy: '2026-11-10', toAnswer: true })
const soup = leftover({ id: 4, recipeId: 11, recipeName: 'Soup', portions: 2, useBy: '2026-11-14' })
const QUESTION = "Chilli was to be used by Tue. Had it, threw it out, or wasn't there?"

function setup(extra: Record<string, unknown> = {}) {
  const api = mockApi({
    'GET /api/plan': { today: '2026-11-12', horizonDays: 3, updating: false, slots: [] },
    'GET /api/plan/to-confirm': { slots: [] },
    'GET /api/plan/couldnt-plan': { slots: [] },
    'GET /api/plan/leftovers': { leftovers: [asked, soup] },
    'GET /api/today/advance-steps': { steps: [] },
    'GET /api/today/streak': { days: 0 },
    'GET /api/stock': { ingredients: [] },
    'GET /api/stock/spoiled': { lots: [], today: '2026-11-12' },
    'GET /api/storage-places': [],
    'GET /api/household/settings': { frozenUseByDays: 90, defaultLeftoverUseByDays: 3 },
    ...extra,
  } as Parameters<typeof mockApi>[0])
  renderWithProviders(createElement(TodayScreen))
  return api
}

describe('Today: the Leftovers seam is shared with the flow', () => {
  it('lists the question and the Leftover although the flow mounts too, and asks for the list once', async () => {
    const api = setup()
    expect(await screen.findByText(QUESTION)).toBeInTheDocument()
    expect(screen.getByText('Soup')).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByText(QUESTION)).toBeInTheDocument()
    expect(api.callsTo('GET', '/api/plan/leftovers')).toHaveLength(1)
  })

  it('answering still works against the shared list', async () => {
    const api = setup({
      'POST /api/plan/leftovers/3/had-it?dryRun=1': { replanned: [] },
      'POST /api/plan/leftovers/3/answer': { status: 204 },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Had it' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/leftovers/3/answer')).toHaveLength(1))
  })
})
