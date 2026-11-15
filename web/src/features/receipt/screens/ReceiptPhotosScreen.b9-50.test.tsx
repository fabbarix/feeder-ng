// B9-50 (SSP-19, A11Y-09 receipt row): the photos screen's first action is the big one, and the photo rows' icons are one IconSet.
//   With no photo the sticky primary is "Take a photo" (Camera icon; "Choose a photo" on a computer: no coarse pointer) and the page says "Take a photo of
//   the whole receipt. Long receipt? Take it in parts, top to bottom." There is no other "Take a photo" button and no "Read the receipt" button yet.
//   From the first photo the sticky primary is "Read the receipt" and "Add another photo" is the secondary in the list. Focus after a photo is added
//   goes to its row's Edit button. Edit and Remove of a photo row are one IconSet (the gap is the token's: 8 px fine pointer, 12 px coarse).
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { publishReceiptSession } from '../lib/receiptSession'
import type { UseReceiptPhotos } from '../hooks/useReceiptPhotos'
import type { UseReceiptRead } from '../hooks/useReceiptRead'

const photosRef = vi.hoisted(() => ({ current: {} as UseReceiptPhotos }))
const readRef = vi.hoisted(() => ({ current: {} as UseReceiptRead }))
const availRef = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const online = vi.hoisted(() => ({ offline: false }))
vi.mock('../hooks/useReceiptPhotos', () => ({ useReceiptPhotos: () => photosRef.current }))
vi.mock('../hooks/useReceiptRead', () => ({ useReceiptRead: () => readRef.current }))
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
const coarse = (on: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: on && q.includes('pointer: coarse'), media: q, addEventListener() {}, removeEventListener() {} }))
const ui = (
  <MemoryRouter initialEntries={['/scan', '/scan/receipt']} initialIndex={1}>
    <ToastProvider>
      <ConfirmProvider>
        <Routes>
          <Route path="/scan/receipt" element={<ReceiptPhotosScreen />} />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
      </ConfirmProvider>
    </ToastProvider>
  </MemoryRouter>
)
const bar = () => within(screen.getByRole('group', { name: 'Actions' }))
const photoHint = 'Take a photo of the whole receipt. Long receipt? Take it in parts, top to bottom.'

beforeEach(() => {
  online.offline = false
  publishReceiptSession({ shopId: 7, clientUuids: ['u1', 'u2'] })
  setPhotos(0)
  readRef.current = { phase: 'idle', busy: false, error: undefined, elapsedSeconds: 0, connectionLost: false, readId: undefined, start: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined), reset: vi.fn() } as UseReceiptRead
  availRef.current = { loading: false, enabled: true, isAdmin: false, statusFailed: false, settingsLink: false, photos: true, retry: vi.fn() }
  coarse(true)
})
afterEach(() => {
  publishReceiptSession(undefined)
  vi.unstubAllGlobals()
})

describe('with no photo the first action is the big one', () => {
  it('the sticky primary is "Take a photo", with the Camera icon', () => {
    render(ui)
    const take = bar().getByRole('button', { name: 'Take a photo' })
    expect(take).toHaveAttribute('data-variant', 'primary')
    expect(take.querySelector('svg')).not.toBeNull()
    expect(take).toBeEnabled()
  })
  it('there is no other "Take a photo" button and no "Read the receipt" button yet', () => {
    render(ui)
    expect(screen.getAllByRole('button', { name: 'Take a photo' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Read the receipt' })).toBeNull()
  })
  it('the page says what to photograph, and that a long receipt can be taken in parts', () => {
    render(ui)
    expect(screen.getByText(photoHint)).toBeInTheDocument()
    expect(screen.queryByText('Long receipt? Take it in parts, top to bottom.')).toBeNull()
  })
  it('on a computer it reads "Choose a photo"', () => {
    coarse(false)
    render(ui)
    expect(bar().getByRole('button', { name: 'Choose a photo' })).toHaveAttribute('data-variant', 'primary')
    expect(screen.queryByRole('button', { name: 'Take a photo' })).toBeNull()
  })
  it('pressing it opens the camera input (the shared ImageFileInput with capture)', async () => {
    const { container } = render(ui)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toHaveAttribute('capture', 'environment')
    const click = vi.spyOn(input, 'click')
    await userEvent.click(bar().getByRole('button', { name: 'Take a photo' }))
    expect(click).toHaveBeenCalled()
  })
  it('is disabled while no photo can be added', () => {
    setPhotos(0, { canAdd: false })
    render(ui)
    expect(bar().getByRole('button', { name: 'Take a photo' })).toBeDisabled()
  })
  it('offline it can still take a photo, and the page still says reading needs a connection', () => {
    online.offline = true
    render(ui)
    expect(bar().getByRole('button', { name: 'Take a photo' })).toBeEnabled()
    expect(screen.getByText('Reading the receipt needs a connection')).toBeInTheDocument()
  })
})

describe('from the first photo the primary reads the receipt', () => {
  it('"Read the receipt" is the sticky primary and "Take a photo" is gone', () => {
    setPhotos(1)
    render(ui)
    const read = bar().getByRole('button', { name: 'Read the receipt' })
    expect(read).toHaveAttribute('data-variant', 'primary')
    expect(read).toBeEnabled()
    expect(screen.queryByRole('button', { name: /^(Take|Choose) a photo$/ })).toBeNull()
  })
  it('"Add another photo" is the secondary button in the list, not in the bar', () => {
    setPhotos(1)
    render(ui)
    const add = screen.getByRole('button', { name: 'Add another photo' })
    expect(add).toHaveAttribute('data-variant', 'secondary')
    expect(bar().queryByRole('button', { name: 'Add another photo' })).toBeNull()
  })
  it('with 4 photos there is no Add another photo', () => {
    setPhotos(4)
    render(ui)
    expect(screen.queryByRole('button', { name: 'Add another photo' })).toBeNull()
    expect(bar().getByRole('button', { name: 'Read the receipt' })).toBeEnabled()
  })
  it('the hint about a long receipt stays under the photos', () => {
    setPhotos(1)
    render(ui)
    expect(screen.getByText('Long receipt? Take it in parts, top to bottom.')).toBeInTheDocument()
    expect(screen.queryByText(photoHint)).toBeNull()
  })
  it('pressing Read the receipt starts the read', async () => {
    setPhotos(1)
    render(ui)
    await userEvent.click(bar().getByRole('button', { name: 'Read the receipt' }))
    expect(readRef.current.start).toHaveBeenCalledTimes(1)
  })
})

describe('a photo row', () => {
  it('Edit and Remove are one IconSet', () => {
    setPhotos(2)
    render(ui)
    const rows = within(screen.getByRole('list', { name: 'Photos' })).getAllByRole('listitem')
    for (const [i, row] of rows.entries()) {
      const set = row.querySelector('.icon-set')
      expect(set, `photo ${i + 1} has an IconSet`).not.toBeNull()
      expect(within(set as HTMLElement).getByRole('button', { name: `Edit photo ${i + 1}` })).toBeInTheDocument()
      expect(within(set as HTMLElement).getByRole('button', { name: `Remove photo ${i + 1}` })).toBeInTheDocument()
    }
  })
  it('focus goes to the Edit button of the photo that was added', async () => {
    setPhotos(0)
    const { container, rerender } = render(ui)
    const file = new File(['x'], 'r.jpg', { type: 'image/jpeg' })
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } })
    setPhotos(1)
    rerender(ui)
    expect(screen.getByRole('button', { name: 'Edit photo 1' })).toHaveFocus()
    // a second photo: its Edit button
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } })
    setPhotos(2)
    rerender(ui)
    expect(screen.getByRole('button', { name: 'Edit photo 2' })).toHaveFocus()
  })
  it('focus does not jump to Edit when the count did not grow from an add (a Remove)', async () => {
    setPhotos(2)
    const { rerender } = render(ui)
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo 2' }))
    setPhotos(1)
    rerender(ui)
    expect(screen.getByRole('button', { name: 'Edit photo 1' })).not.toHaveFocus()
  })
})
