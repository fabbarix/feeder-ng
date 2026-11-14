// b8-rxweb: <ReceiptReadWatcher /> is mounted once in the app shell (inside the router and the providers). It renders nothing.
// On mount it resumes a read that survived a reload (resumeBackgroundRead). When a read finishes while the User is NOT on /scan or under
// /scan/receipt it shows the toast lib/backgroundCopy.finishedToast plans, and the toast's action opens the plan's route.
// Pinned API: export function ReceiptReadWatcher(): null  (from ./ReceiptReadWatcher; also exported from features/receipt/index.ts)
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../ui'
import { readDone, SHOP_ID, UUIDS } from '../fixtures.test-helper'

const api = vi.hoisted(() => ({ startRead: vi.fn(), getRead: vi.fn(), cancelRead: vi.fn(), apply: vi.fn() }))
vi.mock('../api', () => ({ receiptApi: api }))
const me = vi.hoisted(() => ({ isAdmin: false }))
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: { id: 1, email: 'a@b.c', displayName: 'A', isAdmin: me.isAdmin } }) }))

import { BACKGROUND_READ_KEY, getBackgroundRead, resetBackgroundRead, startBackgroundRead } from '../lib/backgroundRead'
import { POLL_INTERVAL_MS } from '../lib/readPolling'
import { forgetRead } from '../lib/readStore'
import { ReceiptReadWatcher } from './ReceiptReadWatcher'

const Where = () => <p data-testid="where">{useLocation().pathname}</p>
function mount(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <ReceiptReadWatcher />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}
const begin = () => act(async () => { await startBackgroundRead({ shopId: SHOP_ID, clientUuids: UUIDS }, [{ dataUrl: 'data:,x' }]) })
const finish = (view: unknown) => act(async () => { api.getRead.mockResolvedValue(view); await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS) })

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.clearAllMocks()
  resetBackgroundRead()
  forgetRead()
  me.isAdmin = false
  api.startRead.mockResolvedValue({ id: 'rd-1' })
  api.getRead.mockResolvedValue({ status: 'running' })
})
afterEach(() => {
  resetBackgroundRead()
  vi.useRealTimers()
})

describe('the toast', () => {
  it('a read that finishes while the User is elsewhere says so, with Review that opens the Receipt review', async () => {
    mount('/plan')
    await begin()
    await finish(readDone())
    expect(await screen.findByText('Receipt read: review 9 changes')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/scan/receipt/review')
  })

  it('a failure while elsewhere is an error toast with Read it again, which clears it and opens the photos', async () => {
    mount('/recipes')
    await begin()
    await finish({ status: 'failed', error: { code: 'no_receipt_found', message: 'm' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('No receipt found in the photos. Take it flat, in good light.')
    await userEvent.click(screen.getByRole('button', { name: 'Read it again' }))
    expect(getBackgroundRead()).toBeUndefined()
    expect(screen.getByTestId('where')).toHaveTextContent('/scan/receipt')
  })

  it.each(['/scan', '/scan/receipt', '/scan/receipt/review'])('no toast on %s: the User sees it there already', async (path) => {
    mount(path)
    await begin()
    await finish(readDone())
    expect(screen.queryByText('Receipt read: review 9 changes')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull()
  })

  it('a cancelled read says nothing', async () => {
    mount('/plan')
    await begin()
    const { cancelBackgroundRead } = await import('../lib/backgroundRead')
    await act(async () => { await cancelBackgroundRead() })
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3) })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(/Receipt read/)).toBeNull()
  })

  it('follows the User: the toast is decided where they are when the read ends', async () => {
    mount('/scan')
    await begin()
    await finish(readDone())
    expect(screen.queryByText('Receipt read: review 9 changes')).toBeNull()
  })
})

describe('after a reload', () => {
  it('picks up the read the session entry names and toasts when it is done', async () => {
    sessionStorage.setItem(BACKGROUND_READ_KEY, JSON.stringify({ shopId: SHOP_ID, readId: 'rd-1', clientUuids: UUIDS, startedAt: Date.now() }))
    mount('/plan')
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(getBackgroundRead()).toMatchObject({ status: 'reading', readId: 'rd-1' })
    await finish(readDone())
    expect(await screen.findByText('Receipt read: review 9 changes')).toBeInTheDocument()
  })
})
