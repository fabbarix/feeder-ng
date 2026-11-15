// B9-46 (SET-16): the Members page reads each Member's Aways (GET /api/members/{id}/away) for the list's info line; a failed read
// leaves the list as it was. Today is Sun 15 Nov 2026 (GET /api/plan).
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { admin, anna, cook, marco, sam } from '../components/fixtures'
import { ADMIN_ME, mockApi, renderWithProviders } from '../test-utils'
import { MembersPage } from './MembersPage'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))
const base = { 'GET /api/me': ADMIN_ME, 'GET /api/members': [anna, marco, sam], 'GET /api/allowlist': [admin, cook], 'GET /api/plan': { today: '2026-11-15', horizonDays: 7, updating: false, slots: [], away: [] } }
const away = { id: 1, memberId: 2, memberName: 'Marco', from: '2026-11-20', fromMealSlotId: null, through: '2026-11-27', throughMealSlotId: null, started: false }

describe('MembersPage: Away', () => {
  it('reads the Aways of every Member and shows the next one on its row', async () => {
    const api = mockApi({ ...base, 'GET /api/members/1/away': [], 'GET /api/members/2/away': [away], 'GET /api/members/3/away': [] })
    renderWithProviders(<MembersPage />)
    expect(await screen.findByRole('button', { name: 'Marco, Away 20–27 Nov' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anna' })).toBeInTheDocument()
    expect(api.callsTo('GET', '/api/members/2/away')).toHaveLength(1)
  })

  it('a failed read of the Aways does not break the list', async () => {
    mockApi({ ...base, 'GET /api/members/1/away': { status: 500, json: { error: { code: 'internal', message: 'no' } } } })
    renderWithProviders(<MembersPage />)
    expect(await screen.findByRole('button', { name: 'Anna' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Marco' })).toBeInTheDocument()
  })
})
