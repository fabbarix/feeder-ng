// RR4: the "Read the receipt" row the Scan screen passes into its Scanned list's `footer` slot (SR4: ScannedList footer?: ReactNode).
// A standalone component: SR4 is not in this base, so it takes everything by props and imports nothing of the Scan screen.
// Pinned API of ./ReadReceiptFooter (also exported from features/receipt/index.ts):
//   <ReadReceiptFooter shopId={number} clientUuids={string[]} online={boolean} assistantAvailable={boolean}
//                      isAdmin?={boolean} pendingScans?={number} />
//   clientUuids: the uuids of the applied scans of this Shop's Scanned list. pendingScans: scans still waiting to sync.
// What it shows (design 3.1, 7.3):
//   no scans (clientUuids empty)                  nothing
//   assistant unavailable, a User                 nothing (hidden)
//   assistant unavailable, an Admin               a muted row "Read the receipt" with "Turn on the Recipe Assistant in Settings", a link to /settings/recipe-assistant
//   offline                                       a muted row, meta "Reading the receipt needs a connection"
//   scans waiting to sync                         a muted row, meta "Waiting for 2 Scans to sync first"
//   otherwise                                     the row: Receipt icon, "Read the receipt", meta "Fill in Prices and weighed amounts from a photo"; pressing it
//                                                 publishes the session (publishReceiptSession({shopId, clientUuids})) and goes to /scan/receipt
//   Muted rows are not buttons. Offline wins over waiting to sync.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { getReceiptSession, publishReceiptSession } from '../lib/receiptSession'
import { ReadReceiptFooter, type ReadReceiptFooterProps } from './ReadReceiptFooter'

afterEach(() => publishReceiptSession(undefined))

const Where = () => <p data-testid="where">{useLocation().pathname}</p>
function show(over: Partial<ReadReceiptFooterProps> = {}) {
  const props: ReadReceiptFooterProps = { shopId: 7, clientUuids: ['u1', 'u2'], online: true, assistantAvailable: true, ...over }
  return render(
    <MemoryRouter initialEntries={['/scan']}>
      <ul>
        <ReadReceiptFooter {...props} />
      </ul>
      <Where />
    </MemoryRouter>,
  )
}
const row = () => screen.queryByRole('button', { name: 'Read the receipt' })

describe('the active row', () => {
  it('shows the title and the meta as a button', () => {
    show()
    expect(row()).toBeInTheDocument()
    expect(screen.getByText('Fill in Prices and weighed amounts from a photo')).toBeInTheDocument()
  })
  it('opens /scan/receipt and hands the session over', async () => {
    show()
    await userEvent.click(row()!)
    expect(screen.getByTestId('where')).toHaveTextContent('/scan/receipt')
    expect(getReceiptSession()).toEqual({ shopId: 7, clientUuids: ['u1', 'u2'] })
  })
  it('is shown for a User and for an Admin alike when the assistant is available', () => {
    show({ isAdmin: true })
    expect(row()).toBeInTheDocument()
  })
})

describe('hidden', () => {
  it('with no scans', () => {
    const { container } = show({ clientUuids: [] })
    expect(container.querySelector('li')).toBeNull()
    expect(screen.queryByText('Read the receipt')).toBeNull()
  })
  it('for a User when the assistant is unavailable', () => {
    const { container } = show({ assistantAvailable: false })
    expect(container.querySelector('li')).toBeNull()
    expect(screen.queryByText('Read the receipt')).toBeNull()
  })
})

describe('muted', () => {
  it('an Admin sees how to turn the assistant on, with a link to its settings', () => {
    show({ assistantAvailable: false, isAdmin: true })
    expect(row()).toBeNull()
    expect(screen.getByText('Read the receipt')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Turn on the Recipe Assistant in Settings/ })).toHaveAttribute('href', '/settings/recipe-assistant')
  })
  it('offline says the read needs a connection and cannot be pressed', async () => {
    show({ online: false })
    expect(row()).toBeNull()
    expect(screen.getByText('Reading the receipt needs a connection')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Read the receipt'))
    expect(screen.getByTestId('where')).toHaveTextContent('/scan')
    expect(screen.getByTestId('where')).not.toHaveTextContent('/scan/receipt')
  })
  it('scans waiting to sync say how many', () => {
    show({ pendingScans: 2 })
    expect(row()).toBeNull()
    expect(screen.getByText('Waiting for 2 Scans to sync first')).toBeInTheDocument()
  })
  it('one waiting scan is singular', () => {
    show({ pendingScans: 1 })
    expect(screen.getByText('Waiting for 1 Scan to sync first')).toBeInTheDocument()
  })
  it('offline wins over waiting to sync', () => {
    show({ online: false, pendingScans: 3 })
    expect(screen.getByText('Reading the receipt needs a connection')).toBeInTheDocument()
    expect(screen.queryByText(/Waiting for/)).toBeNull()
  })
  it('turns on again when the connection is back (a new render)', () => {
    const { rerender } = show({ online: false })
    rerender(
      <MemoryRouter initialEntries={['/scan']}>
        <ul>
          <ReadReceiptFooter shopId={7} clientUuids={['u1']} online assistantAvailable />
        </ul>
      </MemoryRouter>,
    )
    expect(row()).toBeInTheDocument()
  })
  it('pending scans of zero do not mute it', () => {
    show({ pendingScans: 0 })
    expect(row()).toBeInTheDocument()
  })
})
