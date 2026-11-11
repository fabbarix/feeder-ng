// A1 phase 2: /settings/access-requests is a Settings sub-page like the others: Breadcrumbs Settings > Sign-in requests above
// the h1 (from the route table in app/breadcrumbs.ts), no "Back to Settings" link. The title is one name everywhere: the
// Settings index row, the crumb and the h1 are all "Sign-in requests" (the body copy still says Access Request).
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { accessStrings } from '../strings'
import { AccessRequestsPage } from './AccessRequestsPage'

afterEach(() => vi.unstubAllGlobals())

describe('AccessRequestsPage: breadcrumbs', () => {
  it('shows Settings > Sign-in requests above the h1 and no back link', async () => {
    mockApi({ 'GET /api/access-requests': { requests: [], count: 0 }, 'GET /api/access-requests/history': { events: [] } })
    const { container } = renderWithProviders(<AccessRequestsPage />, '/settings/access-requests')
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Sign-in requests' })
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.querySelector('a[href="/settings"]')).toHaveTextContent('Settings')
    expect(nav.querySelectorAll('a')).toHaveLength(1)
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent('Sign-in requests')
    expect(container.querySelector('.page-header')).toContainElement(nav)
    expect(nav.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryAllByRole('link', { name: /^back to/i })).toHaveLength(0)
  })

  it('the page title string is the index row title', () => {
    expect(accessStrings.title).toBe('Sign-in requests')
    expect(accessStrings).not.toHaveProperty('backToSettings')
  })
})
