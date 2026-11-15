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

  // SET-12: an R-E row. title = the name, meta = the email; the state is the value ("13 days left") with the sub-value "asked 1 day ago".
  it('is an R-E row: the name is the title, the email the meta, "13 days left" the value and "asked 1 day ago" its sub-value', () => {
    setup()
    const zia0 = screen.getAllByRole('listitem')[0]!
    expect(zia0.querySelector('.list-row__title')).toHaveTextContent('Zia Rosa')
    expect(zia0.querySelector('.list-row__meta')).toHaveTextContent('zia@example.test')
    expect(zia0.querySelector('.list-row__value')).toHaveTextContent('13 days left')
    expect(zia0.querySelector('.list-row__sub-value')).toHaveTextContent('asked 1 day ago')
  })

  it('a request with no name from Google has the email as its title and the meta "No name from Google"', () => {
    setup([{ ...zia, name: '' }])
    const li = screen.getAllByRole('listitem')[0]!
    expect(li.querySelector('.list-row__title')).toHaveTextContent('zia@example.test')
    expect(li.querySelector('.list-row__meta')).toHaveTextContent('No name from Google')
    expect(within(li).getAllByText('zia@example.test')).toHaveLength(1) // the email is not repeated as the meta
  })

  it('with two days or fewer left the state takes the warn tone (never spoil or danger, DS-06); with more it is plain', () => {
    setup([
      { ...zia, id: 1, expiresAt: '2026-11-12T12:00:00Z' },
      { ...zia, id: 2, email: 'b@example.test', expiresAt: '2026-11-13T12:00:00Z' },
      { ...zia, id: 3, email: 'c@example.test', expiresAt: '2026-11-23T12:00:00Z' },
    ])
    const values = screen.getAllByRole('listitem').map((li) => li.querySelector('.list-row__value [data-tone]'))
    expect(values[0]).toHaveAttribute('data-tone', 'warn') // 2 days left
    expect(values[1]).toBeNull() // 3 days left
    expect(values[2]).toBeNull()
    expect(document.querySelector('[data-tone="spoil"], [data-tone="danger"], [data-status="spoil"], [data-status="danger"]')).toBeNull()
  })

  it('the avatar is a neutral monogram (data-tone="neutral"), not the accent fill', () => {
    setup()
    for (const a of screen.getAllByRole('img')) expect(a).toHaveAttribute('data-tone', 'neutral')
  })

  it('Deny is an outlined danger secondary and Approve an outlined secondary, both buttons, Deny first, in the actions slot', () => {
    setup([zia])
    const li = screen.getAllByRole('listitem')[0]!
    const actions = li.querySelector('.list-row__actions') as HTMLElement
    expect(actions).not.toBeNull()
    expect(li).toHaveAttribute('data-actions', 'true')
    expect(li.querySelector('.list-row__trailing')).toBeNull()
    const buttons = within(actions).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Deny', 'Approve'])
    expect(buttons[0]).toHaveAttribute('data-variant', 'danger-secondary')
    expect(buttons[1]).toHaveAttribute('data-variant', 'secondary')
    expect(buttons[0]).toHaveAccessibleName('Deny zia@example.test')
    expect(buttons[1]).toHaveAccessibleName('Approve zia@example.test')
  })

  it('there is no tile in the list: the empty line and the approval note are Muted lines', () => {
    setup()
    expect(document.querySelector('.tile')).toBeNull()
    expect(screen.getByText(/approving lets/i)).toHaveClass('muted')
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
    expect(screen.getByText('Nobody is waiting to join.')).toHaveClass('muted')
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('shows an error alert', () => {
    render(<AccessRequestList requests={[zia]} now={now} error="That request was already answered" onApprove={vi.fn()} onDeny={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('already answered')
    expect(screen.getByRole('alert')).toHaveClass('form-error') // B9-52: <FormError>, not a bold running sentence
  })

  it('the rows sit in .access__list, the hook of the phone layout (actions under the text)', () => {
    setup()
    const list = document.querySelector('.access__list')
    expect(list).not.toBeNull()
    const rows = within(list as HTMLElement).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(within(row).getByRole('button', { name: /^Approve / }).closest('.list-row__actions')).not.toBeNull()
  })
})
