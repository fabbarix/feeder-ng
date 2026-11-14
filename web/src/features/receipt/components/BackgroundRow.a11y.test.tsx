// b8-rxweb: accessibility of the row's three background states (design 3.3). Real buttons, a named list, a polite live region while reading,
// the failure's words reachable, Dismiss a named IconButton, nothing a div button.
import { act, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readDone, SHOP_ID, UUIDS } from '../fixtures.test-helper'

const api = vi.hoisted(() => ({ startRead: vi.fn(), getRead: vi.fn(), cancelRead: vi.fn(), apply: vi.fn() }))
vi.mock('../api', () => ({ receiptApi: api }))
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: { id: 1, email: 'a@b.c', displayName: 'A', isAdmin: false } }) }))

import { resetBackgroundRead, startBackgroundRead } from '../lib/backgroundRead'
import { POLL_INTERVAL_MS } from '../lib/readPolling'
import { forgetRead } from '../lib/readStore'
import { ReadReceiptFooter } from './ReadReceiptFooter'

const mount = () =>
  render(
    <MemoryRouter>
      <ul aria-label="Scanned list footer">
        <ReadReceiptFooter shopId={SHOP_ID} clientUuids={UUIDS} online assistantAvailable />
      </ul>
    </MemoryRouter>,
  )
const begin = () => act(async () => { await startBackgroundRead({ shopId: SHOP_ID, clientUuids: UUIDS }, [{ dataUrl: 'data:,x' }]) })
const finish = (view: unknown) => act(async () => { api.getRead.mockResolvedValue(view); await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS) })

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.clearAllMocks()
  resetBackgroundRead()
  forgetRead()
  api.startRead.mockResolvedValue({ id: 'rd-1' })
  api.getRead.mockResolvedValue({ status: 'running' })
})
afterEach(() => {
  resetBackgroundRead()
  vi.useRealTimers()
})

describe('the background row: accessibility', () => {
  it('reading: a button named by its title, with a polite status that is not the button itself', async () => {
    await begin()
    const { container } = mount()
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('button', { name: /Reading the receipt/ })).toBeInTheDocument()
    expect(container.querySelector('[onclick], div[role=button], span[role=button]')).toBeNull()
  })

  it('ready: one button, named with the count, and the meta is part of what it announces', async () => {
    await begin()
    await finish(readDone())
    mount()
    const button = screen.getByRole('button', { name: /Receipt read: review 9 changes/ })
    expect(button.tagName).toBe('BUTTON')
    expect(screen.getByText('Nothing changes until you apply.')).toBeInTheDocument()
  })

  it('failed: the row button and a separate Dismiss button, both with names; the failure is text, not colour alone', async () => {
    await begin()
    await finish({ status: 'failed', error: { code: 'no_receipt_found', message: 'm' } })
    mount()
    const list = screen.getByRole('list', { name: 'Scanned list footer' })
    expect(within(list).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(
      expect.arrayContaining([expect.stringMatching(/The receipt could not be read/), 'Dismiss']),
    )
    expect(screen.getByText('No receipt found in the photos. Take it flat, in good light.')).toBeInTheDocument()
  })
})
