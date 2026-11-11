import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AccessRequest } from '../types'
import { AccessRequestList } from './AccessRequestList'

const now = new Date('2026-11-10T12:00:00Z')
const zia: AccessRequest = {
  id: 5, email: 'zia@example.test', name: 'Zia Rosa', picture: '', requestedAt: '2026-11-09T12:00:00Z', expiresAt: '2026-11-23T12:00:00Z',
}
const rex: AccessRequest = { ...zia, id: 6, email: 'rex@example.test', name: '<b>Rex</b>', requestedAt: '2026-11-10T11:00:00Z' }

function setup(requests: AccessRequest[] = [zia, rex]) {
  const props = { requests, now, onApprove: vi.fn(), onDeny: vi.fn() }
  render(<AccessRequestList {...props} />)
  return props
}

describe('AccessRequestList', () => {
  it('lists each request with name, email, when it was asked and the days left', () => {
    setup()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByText('Zia Rosa')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('zia@example.test')).toBeInTheDocument()
    expect(within(rows[0]!).getByText(/asked 1 day ago/i)).toBeInTheDocument()
    expect(within(rows[0]!).getByText(/13 days left/i)).toBeInTheDocument()
    expect(within(rows[1]!).getByText(/asked 1 hour ago/i)).toBeInTheDocument()
  })

  it('shows Google text as text, never as markup', () => {
    setup()
    expect(screen.getByText('<b>Rex</b>')).toBeInTheDocument()
    expect(document.querySelector('b')).toBeNull()
  })

  it('approves and denies by id with buttons named for the person', async () => {
    const { onApprove, onDeny } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Approve zia@example.test' }))
    expect(onApprove).toHaveBeenCalledWith(5)
    await userEvent.click(screen.getByRole('button', { name: 'Deny rex@example.test' }))
    expect(onDeny).toHaveBeenCalledWith(6)
  })

  it('shows the Google photo and falls back to the initials when it fails to load (A8)', () => {
    render(<AccessRequestList requests={[{ ...zia, picture: 'https://lh3.googleusercontent.com/a/zia' }]} now={now} onApprove={vi.fn()} onDeny={vi.fn()} />)
    const photo = screen.getByRole('img', { name: 'Zia Rosa' })
    expect(photo.tagName).toBe('IMG')
    fireEvent.error(photo)
    expect(screen.getByRole('img', { name: 'Zia Rosa' })).toHaveTextContent('ZR')
    expect(document.querySelector('img')).toBeNull()
  })

  it('says what approving means', () => {
    setup()
    expect(screen.getByText(/approving lets .* sign in as a user/i)).toBeInTheDocument()
  })

  it('is calm when nobody is waiting', () => {
    setup([])
    expect(screen.getByText('Nobody is waiting to join.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('shows an error alert', () => {
    render(<AccessRequestList requests={[zia]} now={now} error="That request was already answered" onApprove={vi.fn()} onDeny={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('already answered')
  })

  it('the rows sit in .access__list, the hook of the phone layout (actions under the text)', () => {
    setup()
    const list = document.querySelector('.access__list')
    expect(list).not.toBeNull()
    const rows = within(list as HTMLElement).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(within(row).getByRole('button', { name: /^Approve / }).closest('.list-row__trailing')).not.toBeNull()
  })
})
