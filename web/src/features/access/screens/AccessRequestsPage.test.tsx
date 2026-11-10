import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import type { AccessRequest } from '../types'
import { AccessRequestsPage } from './AccessRequestsPage'

afterEach(() => vi.unstubAllGlobals())

const zia: AccessRequest = {
  id: 5, email: 'zia@example.test', name: 'Zia Rosa', picture: '', requestedAt: '2026-11-09T12:00:00Z', expiresAt: '2026-11-23T12:00:00Z',
}

describe('AccessRequestsPage', () => {
  it('is open to every User: no Admin gate, the list is fetched', async () => {
    const api = mockApi({
      'GET /api/access-requests': { requests: [zia], count: 1 },
      'GET /api/access-requests/history': { events: [] },
    })
    renderWithProviders(<AccessRequestsPage />)
    expect(await screen.findByText('zia@example.test')).toBeInTheDocument()
    expect(api.callsTo('GET', '/api/access-requests')).toHaveLength(1)
    expect(screen.queryByText(/only admins/i)).toBeNull()
  })

  it('approves from the page', async () => {
    let list = [zia]
    const api = mockApi({
      'GET /api/access-requests': () => ({ requests: list, count: list.length }),
      'GET /api/access-requests/history': { events: [] },
      'POST /api/access-requests/5/approve': () => {
        list = []
        return { id: 9, email: zia.email, displayName: 'Zia Rosa', isAdmin: false }
      },
    })
    renderWithProviders(<AccessRequestsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Approve zia@example.test' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/access-requests/5/approve')).toHaveLength(1))
    expect(await screen.findByText('Nobody is waiting to join.')).toBeInTheDocument()
  })

  it('asks before denying', async () => {
    const api = mockApi({
      'GET /api/access-requests': { requests: [zia], count: 1 },
      'GET /api/access-requests/history': { events: [] },
      'POST /api/access-requests/5/deny': { status: 204 },
    })
    renderWithProviders(<AccessRequestsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Deny zia@example.test' }))
    const dialog = await screen.findByRole('dialog')
    expect(api.callsTo('POST', '/api/access-requests/5/deny')).toHaveLength(0)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deny' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/access-requests/5/deny')).toHaveLength(1))
  })

  it('shows the recent history: who approved or denied whom', async () => {
    mockApi({
      'GET /api/access-requests': { requests: [], count: 0 },
      'GET /api/access-requests/history': {
        events: [
          { kind: 'approved', email: 'zia@example.test', name: 'Zia', at: '2026-11-09T13:00:00Z', actorEmail: 'user@example.test' },
          { kind: 'denied', email: 'rex@example.test', name: 'Rex', at: '2026-11-09T14:00:00Z', actorEmail: 'admin@example.test' },
        ],
      },
    })
    renderWithProviders(<AccessRequestsPage />)
    expect(await screen.findByText(/user@example.test approved zia@example.test/i)).toBeInTheDocument()
    expect(screen.getByText(/admin@example.test denied rex@example.test/i)).toBeInTheDocument()
  })

  it('shows a calm message when somebody else answered first', async () => {
    mockApi({
      'GET /api/access-requests': { requests: [zia], count: 1 },
      'GET /api/access-requests/history': { events: [] },
      'POST /api/access-requests/5/approve': { status: 404, json: { error: { code: 'not_found', message: 'Not found' } } },
    })
    renderWithProviders(<AccessRequestsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Approve zia@example.test' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/already answered/i)
  })
})
