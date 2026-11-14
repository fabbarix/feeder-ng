// b8-rxweb: the receipt pages mark their Page header so receipt.css can space it and keep the sticky bar at the foot (docs/dev/design/b8-rxweb.md 3).
// Pinned: both screens pass `header={<div className="receipt-page-header"><PageHeader .../></div>}` to <Page>, so the markup is
//   .page > .page__header > .receipt-page-header > header.page-header
// The photos screen's progress says the User may leave (design 3.3, b8-rxweb).
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { publishReceiptSession } from '../lib/receiptSession'
import { forgetRead, rememberRead } from '../lib/readStore'
import { READ_ID, readDone, SHOP_ID, UUIDS } from '../fixtures.test-helper'
import type { UseReceiptPhotos } from '../hooks/useReceiptPhotos'
import type { UseReceiptRead } from '../hooks/useReceiptRead'

const photosRef = vi.hoisted(() => ({ current: {} as UseReceiptPhotos }))
const readRef = vi.hoisted(() => ({ current: {} as UseReceiptRead }))
vi.mock('../hooks/useReceiptPhotos', () => ({ useReceiptPhotos: () => photosRef.current }))
vi.mock('../hooks/useReceiptRead', () => ({ useReceiptRead: () => readRef.current }))
vi.mock('../../import/hooks/useReadAvailability', () => ({ useReadAvailability: () => ({ loading: false, enabled: true, isAdmin: false, statusFailed: false, settingsLink: false, photos: true, retry: vi.fn() }) }))
vi.mock('../../../app/useConnectivity', () => ({ useConnectivity: () => ({ offline: false, savedAt: null }) }))
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: { id: 1, email: 'a@b.c', displayName: 'A', isAdmin: false } }) }))
vi.mock('../../products/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }))
vi.mock('../api', () => ({ receiptApi: { startRead: vi.fn(), getRead: vi.fn(), cancelRead: vi.fn(), apply: vi.fn() } }))

import { ReceiptPhotosScreen } from './ReceiptPhotosScreen'
import { ReceiptReviewScreen } from './ReceiptReviewScreen'

function setup(read: Partial<UseReceiptRead> = {}) {
  photosRef.current = { photos: [], count: 0, canAdd: true, busy: false, problem: undefined, add: vi.fn(), remove: vi.fn(), clear: vi.fn(), dismissProblem: vi.fn(), toBody: vi.fn(() => []) } as unknown as UseReceiptPhotos
  readRef.current = { phase: 'idle', busy: false, error: undefined, elapsedSeconds: 0, connectionLost: false, readId: undefined, start: vi.fn(), cancel: vi.fn(), reset: vi.fn(), ...read } as UseReceiptRead
}
const mount = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <ConfirmProvider>
          <div className="page">
            <Routes>
              <Route path="/scan/receipt" element={<ReceiptPhotosScreen />} />
              <Route path="/scan/receipt/review" element={<ReceiptReviewScreen />} />
            </Routes>
          </div>
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  publishReceiptSession({ shopId: SHOP_ID, clientUuids: UUIDS })
  rememberRead({ readId: READ_ID, shopId: SHOP_ID, clientUuids: UUIDS, read: readDone() })
})
afterEach(() => {
  publishReceiptSession(undefined)
  forgetRead()
})

describe('the Page header is marked on both receipt pages', () => {
  it.each(['/scan/receipt', '/scan/receipt/review'])('%s', (path) => {
    setup()
    const { container } = mount(path)
    const marked = container.querySelector('.page__header > .receipt-page-header > header.page-header')
    expect(marked).not.toBeNull()
    expect(marked?.querySelector('h1')).toBeInTheDocument()
  })
})

describe('the photos page while a read runs', () => {
  it('says the User may leave and the read goes on', () => {
    setup({ phase: 'running', busy: true, readId: 'rd-1' })
    mount('/scan/receipt')
    expect(screen.getByText('You can leave. Feeder keeps reading.')).toBeInTheDocument()
  })
  it('shows the progress (and no photo buttons) when opened from the row with no photos', () => {
    setup({ phase: 'running', busy: true, readId: 'rd-1' })
    mount('/scan/receipt')
    expect(screen.getByText('Reading the receipt…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Take a photo' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })
})
