// B9-46 (SET-16): the Member sheet has an "Away" section after the existing fields, for an existing Member only. The footer is unchanged.
import { screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../test-utils'
import { marco, members } from './fixtures'
import { MemberEditor } from './MemberEditor'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))
beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
})
const routes = () =>
  mockApi({
    'GET /api/members': members,
    'GET /api/meal-slots': [],
    'GET /api/plan': { today: '2026-11-15', horizonDays: 7, updating: false, slots: [], away: [] },
    'GET /api/members/2/away': [],
  })
const props = { open: true, users: [], members, onSave: vi.fn(), onClose: vi.fn() }

describe('MemberEditor: the Away section', () => {
  it('comes after the Email and Linked User fields when editing, and the footer keeps Cancel and Save Member with no Close', async () => {
    routes()
    renderWithProviders(<MemberEditor {...props} member={marco} onDelete={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: 'Edit Member' })
    const heading = await within(dialog).findByRole('heading', { name: 'Away', level: 3 })
    const linked = within(dialog).getByRole('combobox', { name: /Linked User/ })
    expect(linked.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Add an Away' })).toBeInTheDocument()
    const footer = dialog.querySelector('.sheet__footer')!
    expect(within(footer as HTMLElement).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(footer as HTMLElement).getByRole('button', { name: 'Save Member' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('adding a Member has no Away section yet', () => {
    routes()
    renderWithProviders(<MemberEditor {...props} />)
    const dialog = screen.getByRole('dialog', { name: 'Add Member' })
    expect(within(dialog).queryByRole('heading', { name: 'Away' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Add an Away' })).toBeNull()
  })
})
