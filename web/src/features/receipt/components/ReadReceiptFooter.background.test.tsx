// b8-rxweb: the "Read the receipt" row on the Scan screen tells where the background read is (design 3.3; docs/dev/design/b8-rxweb.md).
// The row reads the store itself (hooks/useBackgroundRead(shopId)); ReadReceiptFooter keeps its props. For THIS Shop's read it shows:
//   reading  a button-row: "Reading the receipt…" / "You can leave. Feeder keeps reading." (live region role=status); pressing opens /scan/receipt (the progress)
//   ready    "Receipt read: review 9 changes" / "Nothing changes until you apply."; pressing opens /scan/receipt/review; a Dismiss IconButton forgets it (reviewer)
//   failed   "The receipt could not be read" / the failure's words; pressing clears the failure and opens /scan/receipt; a Dismiss IconButton only clears it
// These states win over offline, waiting scans and the assistant being off (the read exists already); no scans -> still nothing.
// A read of another Shop shows the normal row. When nothing is going on the row is as before.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readDone, SHOP_ID, UUIDS } from '../fixtures.test-helper'

const api = vi.hoisted(() => ({ startRead: vi.fn(), getRead: vi.fn(), cancelRead: vi.fn(), apply: vi.fn() }))
vi.mock('../api', () => ({ receiptApi: api }))
const me = vi.hoisted(() => ({ isAdmin: false }))
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: { id: 1, email: 'a@b.c', displayName: 'A', isAdmin: me.isAdmin } }) }))

import { getBackgroundRead, resetBackgroundRead, startBackgroundRead } from '../lib/backgroundRead'
import { forgetRead } from '../lib/readStore'
import { getReceiptSession, publishReceiptSession } from '../lib/receiptSession'
import { POLL_INTERVAL_MS } from '../lib/readPolling'
import { ReadReceiptFooter, type ReadReceiptFooterProps } from './ReadReceiptFooter'
import { ApiError } from '../../../lib/http'
import { act } from '@testing-library/react'

const Where = () => <p data-testid="where">{useLocation().pathname}</p>
function show(over: Partial<ReadReceiptFooterProps> = {}) {
  const props: ReadReceiptFooterProps = { shopId: SHOP_ID, clientUuids: UUIDS, online: true, assistantAvailable: true, ...over }
  return render(
    <MemoryRouter initialEntries={['/scan']}>
      <ul>
        <ReadReceiptFooter {...props} />
      </ul>
      <Where />
    </MemoryRouter>,
  )
}
const begin = (shopId = SHOP_ID) => act(async () => { await startBackgroundRead({ shopId, clientUuids: UUIDS }, [{ dataUrl: 'data:,x' }]) })
const finish = (view: unknown) => act(async () => { api.getRead.mockResolvedValue(view); await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS) })

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.clearAllMocks()
  resetBackgroundRead()
  forgetRead()
  publishReceiptSession(undefined)
  me.isAdmin = false
  api.startRead.mockResolvedValue({ id: 'rd-1' })
  api.getRead.mockResolvedValue({ status: 'running' })
  api.cancelRead.mockResolvedValue(undefined)
})
afterEach(() => {
  resetBackgroundRead()
  vi.useRealTimers()
})

describe('reading', () => {
  it('says it is reading and that leaving is fine, in a live region', async () => {
    await begin()
    show()
    expect(screen.getByText('Reading the receipt…')).toBeInTheDocument()
    expect(screen.getByText('You can leave. Feeder keeps reading.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Reading the receipt…')
    expect(screen.queryByText('Fill in Prices and weighed amounts from a photo')).toBeNull()
  })
  it('opens the progress on /scan/receipt, with the session handed over', async () => {
    await begin()
    show()
    await userEvent.click(screen.getByRole('button', { name: /Reading the receipt/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/scan/receipt')
    expect(getReceiptSession()).toEqual({ shopId: SHOP_ID, clientUuids: UUIDS })
  })
  it('wins over offline and over waiting scans', async () => {
    await begin()
    show({ online: false, pendingScans: 2 })
    expect(screen.getByText('Reading the receipt…')).toBeInTheDocument()
  })
  it('a read of another Shop leaves this Shop\'s row as it was', async () => {
    await begin(SHOP_ID + 1)
    show()
    expect(screen.getByRole('button', { name: 'Read the receipt' })).toBeInTheDocument()
    expect(screen.queryByText('Reading the receipt…')).toBeNull()
  })
})

describe('ready', () => {
  it('says how many changes to review and that nothing changes until applied', async () => {
    await begin()
    await finish(readDone())
    show()
    expect(screen.getByRole('button', { name: /Receipt read: review 9 changes/ })).toBeInTheDocument()
    expect(screen.getByText('Nothing changes until you apply.')).toBeInTheDocument()
  })
  it('opens the Receipt review', async () => {
    await begin()
    await finish(readDone())
    show()
    await userEvent.click(screen.getByRole('button', { name: /Receipt read: review 9 changes/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/scan/receipt/review')
    expect(getReceiptSession()).toEqual({ shopId: SHOP_ID, clientUuids: UUIDS })
  })
  it('Dismiss forgets the read and the plain row is back, so a new read can start (reviewer: else a read with nothing to apply holds the row 10 minutes)', async () => {
    await begin()
    await finish(readDone())
    show()
    await userEvent.click(within(screen.getByRole('list')).getByRole('button', { name: 'Dismiss' }))
    expect(getBackgroundRead()).toBeUndefined()
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/scan$/)
    expect(screen.getByRole('button', { name: 'Read the receipt' })).toBeInTheDocument()
  })
  it('wins over the assistant being off (the read exists already)', async () => {
    await begin()
    await finish(readDone())
    show({ assistantAvailable: false })
    expect(screen.getByRole('button', { name: /Receipt read: review 9 changes/ })).toBeInTheDocument()
  })
  it('is gone, and the plain row is back, when the 10 minutes have passed', async () => {
    await begin()
    await finish(readDone())
    const { rerender } = show()
    await act(async () => { await vi.advanceTimersByTimeAsync(601_000) })
    rerender(
      <MemoryRouter initialEntries={['/scan']}>
        <ul>
          <ReadReceiptFooter shopId={SHOP_ID} clientUuids={UUIDS} online assistantAvailable />
        </ul>
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Read the receipt' })).toBeInTheDocument()
  })
})

describe('failed', () => {
  async function fail() {
    await begin()
    await finish({ status: 'failed', error: { code: 'no_receipt_found', message: 'm' } })
  }
  it('says it could not be read and why', async () => {
    await fail()
    show()
    expect(screen.getByRole('button', { name: /The receipt could not be read/ })).toBeInTheDocument()
    expect(screen.getByText('No receipt found in the photos. Take it flat, in good light.')).toBeInTheDocument()
  })
  it('pressing the row clears the failure and opens the photos to read it again', async () => {
    await fail()
    show()
    await userEvent.click(screen.getByRole('button', { name: /The receipt could not be read/ }))
    expect(getBackgroundRead()).toBeUndefined()
    expect(screen.getByTestId('where')).toHaveTextContent('/scan/receipt')
  })
  it('Dismiss only clears it: the plain row is back and nothing opens', async () => {
    await fail()
    show()
    await userEvent.click(within(screen.getByRole('list')).getByRole('button', { name: 'Dismiss' }))
    expect(getBackgroundRead()).toBeUndefined()
    expect(screen.getByTestId('where')).toHaveTextContent('/scan')
    expect(screen.getByTestId('where')).not.toHaveTextContent('/scan/receipt')
    expect(screen.getByRole('button', { name: 'Read the receipt' })).toBeInTheDocument()
  })
  it('a refused start shows the same way', async () => {
    api.startRead.mockRejectedValue(new ApiError(429, 'too_many_reads', 'x', { retryAfterSeconds: 720 }))
    await begin()
    show()
    expect(screen.getByText('You can read again in 12 minutes.')).toBeInTheDocument()
  })
})

describe('with no scans', () => {
  it('shows nothing, whatever the read says', async () => {
    await begin()
    const { container } = show({ clientUuids: [] })
    expect(container.querySelector('li')).toBeNull()
  })
})
