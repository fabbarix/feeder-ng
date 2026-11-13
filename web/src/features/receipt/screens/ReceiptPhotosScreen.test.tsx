// RR4: route /scan/receipt (design 3.2, 3.3, 7.3, 9; mock-ups 13 and 14), with the hooks stood in for.
// Pinned API of ./ReceiptPhotosScreen:
//   <ReceiptPhotosScreen />       no props; the Scanned list comes from useReceiptSession() (lib/receiptSession, published by the Scan screen / the footer row)
//   Composes: useReceiptSession, useReceiptPhotos, useReceiptRead({shopId, clientUuids}), useReadAvailability (features/import), useConnectivity (app).
//   No session published -> <Navigate to="/scan" replace />.
//   A finished read (useReceiptRead.phase === 'done') -> navigate to /scan/receipt/review (replace).
//   Hooks: ../hooks/useReceiptSession exports useReceiptSession(): ReceiptSession | undefined.
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { publishReceiptSession } from '../lib/receiptSession'
import type { UseReceiptPhotos } from '../hooks/useReceiptPhotos'
import type { UseReceiptRead } from '../hooks/useReceiptRead'

const photosRef = vi.hoisted(() => ({ current: {} as UseReceiptPhotos }))
const readRef = vi.hoisted(() => ({ current: {} as UseReceiptRead, args: [] as unknown[] }))
const availRef = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const online = vi.hoisted(() => ({ offline: false }))
vi.mock('../hooks/useReceiptPhotos', () => ({ useReceiptPhotos: () => photosRef.current }))
vi.mock('../hooks/useReceiptRead', () => ({ useReceiptRead: (...a: unknown[]) => { readRef.args = a; return readRef.current } }))
vi.mock('../../import/hooks/useReadAvailability', () => ({ useReadAvailability: () => availRef.current }))
vi.mock('../../../app/useConnectivity', () => ({ useConnectivity: () => ({ offline: online.offline, savedAt: null }) }))

import { ReceiptPhotosScreen } from './ReceiptPhotosScreen'

const photo = (n: number) => ({ id: `p${n}`, previewUrl: `blob:p/${n}`, dataUrl: `data:image/jpeg;base64,${n}`, width: 1500, height: 2000 })
function setPhotos(n: number, over: Partial<UseReceiptPhotos> = {}) {
  const list = Array.from({ length: n }, (_, i) => photo(i + 1))
  photosRef.current = {
    photos: list, count: n, canAdd: n < 4, busy: false, problem: undefined,
    add: vi.fn(async () => undefined), remove: vi.fn(), clear: vi.fn(), dismissProblem: vi.fn(), toBody: vi.fn(() => list.map((p) => ({ dataUrl: p.dataUrl }))),
    ...over,
  } as UseReceiptPhotos
  return photosRef.current
}
function setRead(over: Partial<UseReceiptRead> = {}) {
  readRef.current = {
    phase: 'idle', busy: false, error: undefined, elapsedSeconds: 0, connectionLost: false, readId: undefined,
    start: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined), reset: vi.fn(),
    ...over,
  } as UseReceiptRead
  return readRef.current
}
function setAvail(over: Record<string, unknown> = {}) {
  availRef.current = { loading: false, enabled: true, isAdmin: false, statusFailed: false, settingsLink: false, photos: true, retry: vi.fn(), ...over }
}

const Where = () => <p data-testid="where">{useLocation().pathname}</p>
function show() {
  return render(
    <MemoryRouter initialEntries={['/scan', '/scan/receipt']} initialIndex={1}>
      <ToastProvider>
        <ConfirmProvider>
          <div data-testid="screen">
            <Routes>
              <Route path="/scan/receipt" element={<ReceiptPhotosScreen />} />
              <Route path="*" element={<p>elsewhere</p>} />
            </Routes>
          </div>
          <Where />
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}
// The screen's own content: ToastProvider's live regions (role status and alert) are always there, outside it.
const inScreen = () => within(screen.getByTestId('screen'))
const readButton = () => screen.queryByRole('button', { name: 'Read the receipt' })

beforeEach(() => {
  online.offline = false
  publishReceiptSession({ shopId: 7, clientUuids: ['u1', 'u2'] })
  setPhotos(0)
  setRead()
  setAvail()
})
afterEach(() => publishReceiptSession(undefined))

describe('the page', () => {
  it('has a Back button and the title as the h1', () => {
    show()
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Read the receipt' })).toBeInTheDocument()
  })
  it('without a published Scanned list goes back to /scan', () => {
    publishReceiptSession(undefined)
    show()
    expect(screen.getByTestId('where')).toHaveTextContent('/scan')
    expect(screen.getByTestId('where')).not.toHaveTextContent('/scan/receipt')
  })
  it('starts the read from this Shop and these scans', () => {
    show()
    expect(readRef.args[0]).toEqual({ shopId: 7, clientUuids: ['u1', 'u2'] })
  })
  it('shows the privacy note (ADR 0018) above the button', () => {
    show()
    expect(screen.getByText('The receipt photos and your Scanned list are sent to Anthropic to read the receipt. Feeder does not keep the photos.')).toBeInTheDocument()
  })
  it('the action sits in a sticky action bar', () => {
    show()
    expect(within(screen.getByRole('group', { name: 'Actions' })).getByRole('button', { name: 'Read the receipt' })).toBeInTheDocument()
  })
})

describe('taking photos', () => {
  it('with none: "Take a photo" opens the native camera (the shared ImageFileInput with capture)', async () => {
    const { container } = show()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toHaveAttribute('capture', 'environment')
    expect(input.accept).toBe('image/*')
    const click = vi.spyOn(input, 'click')
    await userEvent.click(screen.getByRole('button', { name: 'Take a photo' }))
    expect(click).toHaveBeenCalled()
    expect(screen.getByText('Photos (0 of up to 4)')).toBeInTheDocument()
  })
  it('a photo from the camera is added to the list', () => {
    const p = setPhotos(0)
    const { container } = show()
    const file = new File(['x'], 'r.jpg', { type: 'image/jpeg' })
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } })
    expect(p.add).toHaveBeenCalledWith([file])
  })
  it('with photos: a thumbnail and Remove for each, and "Add another photo"', async () => {
    const p = setPhotos(2)
    show()
    expect(screen.getByText('Photos (2 of up to 4)')).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Photos' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getAllByRole('img')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Take a photo' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Add another photo' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo 2' }))
    expect(p.remove).toHaveBeenCalledWith('p2')
  })
  it('the hint for a long receipt shows once there is a photo', () => {
    setPhotos(1)
    show()
    expect(screen.getByText('Long receipt? Take it in parts, top to bottom.')).toBeInTheDocument()
  })
  it('at 4 photos nothing more can be added', () => {
    setPhotos(4)
    show()
    expect(screen.getByText('Photos (4 of up to 4)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add another photo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Take a photo' })).toBeNull()
  })
  it('a photo that was refused says why (the Import copy by code) and can be dismissed', async () => {
    const p = setPhotos(1, { problem: 'photo_too_large' })
    show()
    expect(screen.getByText('A photo is over 8 MB. Use a smaller picture.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(p.dismissProblem).toHaveBeenCalled()
  })
  it('too many photos at once says so', () => {
    setPhotos(4, { problem: 'too_many_photos' })
    show()
    expect(screen.getByText('A read takes up to 4 photos.')).toBeInTheDocument()
  })
})

describe('Read the receipt', () => {
  it('is disabled until there is a photo', () => {
    show()
    expect(readButton()).toBeDisabled()
  })
  it('is disabled while photos are being prepared', () => {
    setPhotos(1, { busy: true })
    show()
    expect(readButton()).toBeDisabled()
  })
  it('starts the read with the photos as {dataUrl}', async () => {
    setPhotos(2)
    show()
    await userEvent.click(readButton()!)
    expect(readRef.current.start).toHaveBeenCalledWith([{ dataUrl: 'data:image/jpeg;base64,1' }, { dataUrl: 'data:image/jpeg;base64,2' }])
  })
  it('offline: disabled, with the reason in words, tied to the button', () => {
    online.offline = true
    setPhotos(1)
    show()
    expect(readButton()).toBeDisabled()
    const reason = screen.getByText('Reading the receipt needs a connection')
    expect(readButton()).toHaveAccessibleDescription('Reading the receipt needs a connection')
    expect(reason).toBeInTheDocument()
  })
  it('the assistant unavailable: disabled, with the Recipe Assistant\'s reason', () => {
    setAvail({ enabled: false, message: 'The Recipe Assistant is off. Ask an Admin to turn it on.' })
    setPhotos(1)
    show()
    expect(readButton()).toBeDisabled()
    expect(screen.getByText('The Recipe Assistant is off. Ask an Admin to turn it on.')).toBeInTheDocument()
  })
  it('an Admin gets the link to the settings', () => {
    setAvail({ enabled: false, isAdmin: true, settingsLink: true, message: 'The Recipe Assistant is off. Turn it on in Settings.' })
    setPhotos(1)
    show()
    expect(screen.getByRole('link', { name: /Recipe Assistant settings/ })).toHaveAttribute('href', '/settings/recipe-assistant')
  })
  it('a model that cannot read photos: disabled, with its message', () => {
    setAvail({ photos: false, photosMessage: "This model can't read photos." })
    setPhotos(1)
    show()
    expect(readButton()).toBeDisabled()
    expect(screen.getByText("This model can't read photos.")).toBeInTheDocument()
  })
  it('waits for the status before it can be pressed', () => {
    setAvail({ loading: true, enabled: false })
    setPhotos(1)
    show()
    expect(readButton()).toBeDisabled()
  })
  it('the household limit used up says when to try again', () => {
    setAvail({ limitMessage: 'Your Household has read 30 recipes in the last hour. Try again in 12 min.' })
    setPhotos(1)
    show()
    expect(readButton()).toBeDisabled()
    expect(screen.getByText(/Try again in 12 min/)).toBeInTheDocument()
  })
})

describe('reading', () => {
  const running = (over: Partial<UseReceiptRead> = {}) => setRead({ phase: 'running', busy: true, readId: 'rd-1', ...over })
  it('shows progress in a live region, with Cancel', async () => {
    setPhotos(2)
    const r = running()
    show()
    const live = inScreen().getByRole('status')
    expect(live).toHaveTextContent('Reading the receipt…')
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByText('Long receipts can take up to a minute')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(r.cancel).toHaveBeenCalled()
  })
  it('after 15 s says long receipts can take up to a minute', () => {
    setPhotos(2)
    running({ elapsedSeconds: 15 })
    show()
    expect(inScreen().getByRole('status')).toHaveTextContent('Long receipts can take up to a minute')
  })
  it('while it runs the photos cannot be changed and the read cannot be started again', () => {
    setPhotos(2)
    running()
    show()
    expect(readButton()).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add another photo' })).toBeNull()
    for (const b of screen.queryAllByRole('button', { name: /^Remove photo/ })) expect(b).toBeDisabled()
  })
  it('says when the connection is lost and that the read continues', () => {
    setPhotos(2)
    running({ connectionLost: true })
    show()
    expect(inScreen().getByRole('status')).toHaveTextContent('Lost the connection. The read continues; come back to see it.')
  })
  it('starting shows the same progress', () => {
    setPhotos(2)
    setRead({ phase: 'starting', busy: true })
    show()
    expect(inScreen().getByRole('status')).toHaveTextContent('Reading the receipt…')
  })
  it('a finished read opens the review', () => {
    setPhotos(2)
    setRead({ phase: 'done', readId: 'rd-1' })
    show()
    expect(screen.getByTestId('where')).toHaveTextContent('/scan/receipt/review')
  })
})

describe('a failed read', () => {
  const failed = (error: UseReceiptRead['error']) => setRead({ phase: 'failed', error })
  it('announces the copy of its code as an alert, and offers Try again for a retryable one', async () => {
    setPhotos(2)
    const r = failed({ code: 'assistant_unreachable' })
    show()
    expect(inScreen().getByRole('alert')).toHaveTextContent("Couldn't reach the assistant. Check the connection and try again.")
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(r.start).toHaveBeenCalledWith([{ dataUrl: 'data:image/jpeg;base64,1' }, { dataUrl: 'data:image/jpeg;base64,2' }])
  })
  it('the photos are kept, so the User can retake one and read again', () => {
    setPhotos(2)
    failed({ code: 'no_receipt_found' })
    show()
    expect(inScreen().getByRole('alert')).toHaveTextContent('No receipt found in the photos. Take it flat, in good light.')
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.getAllByRole('button', { name: /^Remove photo/ })).toHaveLength(2)
    expect(readButton()).toBeEnabled()
  })
  it.each([
    ['assistant_unavailable', { reason: 'no_key' }, 'The Recipe Assistant needs an API key. Ask an Admin.'],
    ['read_in_progress', {}, 'A receipt is already being read. Let it finish, or cancel it.'],
    ['too_many_reads', { retryAfterSeconds: 720 }, 'You can read again in 12 minutes.'],
    ['scans_empty', {}, 'Scan something first.'],
    ['photos_empty', {}, 'Add at least one photo.'],
    ['photo_unsupported', {}, 'A photo could not be read. Use a JPEG, PNG, WebP or HEIC photo.'],
    ['assistant_output_too_long', {}, 'This receipt is too long to read at once. Read it in two parts.'],
    ['timeout', {}, "Couldn't reach the assistant. Check the connection and try again."],
  ])('%s %j', (code, extra, text) => {
    setPhotos(1)
    failed({ code, ...extra })
    show()
    expect(inScreen().getByRole('alert')).toHaveTextContent(text)
  })
  it('an Admin is told the assistant needs settings and gets the link', () => {
    setAvail({ isAdmin: true })
    setPhotos(1)
    failed({ code: 'assistant_unavailable', reason: 'no_key' })
    show()
    expect(inScreen().getByRole('alert')).toHaveTextContent('The Recipe Assistant needs an API key. Add it in Settings.')
    expect(screen.getByRole('link', { name: /Recipe Assistant settings/ })).toHaveAttribute('href', '/settings/recipe-assistant')
  })
})

describe('leaving', () => {
  it('Back with no photos goes straight to /scan', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('elsewhere')).toBeInTheDocument()
  })
  it('Back with photos asks "Discard 2 photos?" in a dialog', async () => {
    const p = setPhotos(2)
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    const dialog = await screen.findByRole('dialog', { name: 'Discard 2 photos?' })
    expect(dialog.tagName).toBe('DIALOG')
    expect(p.clear).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }))
    expect(screen.getByText('elsewhere')).toBeInTheDocument()
  })
  it('Cancel in the dialog keeps the photos and the page', async () => {
    setPhotos(2)
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    const dialog = await screen.findByRole('dialog', { name: 'Discard 2 photos?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('elsewhere')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Read the receipt' })).toBeInTheDocument()
  })
  it('Back while reading does not ask: the read is cancelled by leaving (the hook frees the slot)', async () => {
    setPhotos(2)
    setRead({ phase: 'running', busy: true })
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('elsewhere')).toBeInTheDocument()
  })
})
