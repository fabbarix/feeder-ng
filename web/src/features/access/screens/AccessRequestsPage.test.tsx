import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, pickOption, renderWithProviders, type RecordedCall } from '../../settings/test-utils'
import type { AccessRequest } from '../types'
import { AccessRequestsPage } from './AccessRequestsPage'

afterEach(() => vi.unstubAllGlobals())

const zia: AccessRequest = {
  id: 5, email: 'zia@example.test', name: 'Zia Rosa', picture: '', requestedAt: '2026-11-09T12:00:00Z', expiresAt: '2026-11-23T12:00:00Z',
}

const nonna = { id: 3, name: 'Nonna', avatar: '', userId: null }
const sam = { id: 4, name: 'Sam', avatar: '', userId: 7 }

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

  it('approving opens a sheet first (A3), and Approve in the sheet approves without a Member', async () => {
    let list = [zia]
    const api = mockApi({
      'GET /api/access-requests': () => ({ requests: list, count: list.length }),
      'GET /api/access-requests/history': { events: [] },
      'GET /api/members': [nonna],
      'POST /api/access-requests/5/approve': () => {
        list = []
        return { id: 9, email: zia.email, displayName: 'Zia Rosa', isAdmin: false }
      },
    })
    renderWithProviders(<AccessRequestsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Approve zia@example.test' }))
    const dialog = await screen.findByRole('dialog', { name: 'Approve zia@example.test' })
    expect(api.callsTo('POST', '/api/access-requests/5/approve')).toHaveLength(0)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/access-requests/5/approve')).toHaveLength(1))
    const body = api.callsTo('POST', '/api/access-requests/5/approve')[0]?.body as { memberId?: number } | undefined
    expect(body?.memberId).toBeUndefined()
    expect(await screen.findByText('Nobody is waiting to join.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('offers only the unlinked Members and links the picked one in the same approval', async () => {
    let list = [zia]
    const api = mockApi({
      'GET /api/access-requests': () => ({ requests: list, count: list.length }),
      'GET /api/access-requests/history': { events: [] },
      'GET /api/members': [nonna, sam],
      'POST /api/access-requests/5/approve': () => {
        list = []
        return { id: 9, email: zia.email, displayName: 'Zia Rosa', isAdmin: false }
      },
    })
    renderWithProviders(<AccessRequestsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Approve zia@example.test' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(await within(dialog).findByRole('combobox', { name: 'Link to a Member (optional)' }))
    const names = (await screen.findAllByRole('option')).map((o) => o.textContent ?? '')
    expect(names.some((t) => t.includes('Nonna'))).toBe(true)
    expect(names.some((t) => t.includes('Sam'))).toBe(false) // Sam already has a User
    await userEvent.click(screen.getByRole('option', { name: /Nonna/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/access-requests/5/approve')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/access-requests/5/approve')[0]?.body).toEqual({ memberId: 3 })
  })

  it('Cancel closes the sheet and approves nothing', async () => {
    const api = mockApi({
      'GET /api/access-requests': { requests: [zia], count: 1 },
      'GET /api/access-requests/history': { events: [] },
      'GET /api/members': [nonna],
    })
    renderWithProviders(<AccessRequestsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Approve zia@example.test' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.callsTo('POST', '/api/access-requests/5/approve')).toHaveLength(0)
    expect(screen.getByText('zia@example.test')).toBeInTheDocument()
  })

  it('a Member who got a User meanwhile is refused inside the sheet; the approver can choose again', async () => {
    let members = [nonna]
    let list = [zia]
    const api = mockApi({
      'GET /api/access-requests': () => ({ requests: list, count: list.length }),
      'GET /api/access-requests/history': { events: [] },
      'GET /api/members': () => members,
      'POST /api/access-requests/5/approve': (call: RecordedCall) => {
        if ((call.body as { memberId?: number } | undefined)?.memberId === 3) {
          members = [] // somebody linked Nonna in the meantime
          return { status: 409, json: { error: { code: 'member_unavailable', message: 'x' } } }
        }
        list = []
        return { id: 9, email: zia.email, displayName: 'Zia Rosa', isAdmin: false }
      },
    })
    renderWithProviders(<AccessRequestsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Approve zia@example.test' }))
    const dialog = await screen.findByRole('dialog')
    await pickOption('Link to a Member (optional)', /Nonna/, within(dialog))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }))
    expect(await within(await screen.findByRole('dialog')).findByRole('alert')).toHaveTextContent(/already has a user/i)
    expect(screen.getByText('zia@example.test')).toBeInTheDocument() // the request is still pending
    await waitFor(() => expect(api.callsTo('GET', '/api/members').length).toBeGreaterThanOrEqual(2)) // the picker was refreshed
    // The refused pick is forgotten: Nonna is no longer offered, so the next Approve links nobody.
    expect(await within(screen.getByRole('dialog')).findByText(/every member already has a user/i)).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/access-requests/5/approve')).toHaveLength(2))
    expect((api.callsTo('POST', '/api/access-requests/5/approve')[1]?.body as { memberId?: number } | undefined)?.memberId).toBeUndefined()
    expect(await screen.findByText('Nobody is waiting to join.')).toBeInTheDocument()
  })

  it('approving still works when the Members cannot be loaded', async () => {
    const api = mockApi({
      'GET /api/access-requests': { requests: [zia], count: 1 },
      'GET /api/access-requests/history': { events: [] },
      'GET /api/members': { status: 500, json: { error: { code: 'internal', message: 'x' } } },
      'POST /api/access-requests/5/approve': { id: 9, email: zia.email, displayName: 'Zia Rosa', isAdmin: false },
    })
    renderWithProviders(<AccessRequestsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Approve zia@example.test' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/access-requests/5/approve')).toHaveLength(1))
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

  it('the history says which Member an approval linked', async () => {
    mockApi({
      'GET /api/access-requests': { requests: [], count: 0 },
      'GET /api/access-requests/history': {
        events: [{ kind: 'approved', email: 'zia@example.test', name: 'Zia', at: '2026-11-09T13:00:00Z', actorEmail: 'user@example.test', memberName: 'Nonna' }],
      },
    })
    renderWithProviders(<AccessRequestsPage />)
    expect(await screen.findByText(/approved zia@example.test and linked them to Nonna/i)).toBeInTheDocument()
  })

  it('shows a calm message when somebody else answered first', async () => {
    mockApi({
      'GET /api/access-requests': { requests: [zia], count: 1 },
      'GET /api/access-requests/history': { events: [] },
      'GET /api/members': [nonna],
      'POST /api/access-requests/5/approve': { status: 404, json: { error: { code: 'not_found', message: 'Not found' } } },
    })
    renderWithProviders(<AccessRequestsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Approve zia@example.test' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText(/already answered/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()) // nothing left to approve: the sheet closes
  })
})
