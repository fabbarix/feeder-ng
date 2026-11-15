// B9-52, SET-12: the requests sit in the page's own ListGroup, with no outer tile (a tile nested in a tile wasted width); the
// approval note is a Muted line; the neutral monogram and the R-E row come from AccessRequestList.
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { AccessRequestsPage } from './AccessRequestsPage'

afterEach(() => vi.unstubAllGlobals())

const zia = { id: 5, email: 'zia@example.test', name: 'Zia Rosa', picture: '', requestedAt: '2026-11-09T12:00:00Z', expiresAt: '2026-11-23T12:00:00Z' }

describe('AccessRequestsPage layout (SET-12)', () => {
  it('has no Tile around the list of requests', async () => {
    mockApi({ 'GET /api/access-requests': { requests: [zia], count: 1 }, 'GET /api/access-requests/history': { events: [] } })
    renderWithProviders(<AccessRequestsPage />)
    const row = (await screen.findByText('zia@example.test')).closest('li')!
    expect(row.closest('.tile')).toBeNull()
    expect(row.closest('ul')).not.toBeNull() // still the ListGroup's list
  })

  it('the Recent activity empty line is Muted too', async () => {
    mockApi({ 'GET /api/access-requests': { requests: [], count: 0 }, 'GET /api/access-requests/history': { events: [] } })
    renderWithProviders(<AccessRequestsPage />)
    expect(await screen.findByText('Nothing yet.')).toHaveClass('muted')
  })
})
