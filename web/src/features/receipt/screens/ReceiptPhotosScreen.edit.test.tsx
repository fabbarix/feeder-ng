// Beta 7: crop and rotate the receipt photos before they are read (design 3.2): the shared PhotoEditSheet over ImageEditor.
// Pinned behaviour of ./ReceiptPhotosScreen (hooks stood in for, as in ReceiptPhotosScreen.test.tsx):
//   - every row has "Edit photo N" (ReceiptPhotoList.onEdit); it opens <PhotoEditSheet title="Edit photo N" src={photo.previewUrl} width/height={photo.width/height}/>
//     (a <dialog>) for that photo, free aspect;
//   - Use this -> `photos.applyEdit(photo.id, edit)`; the sheet is `busy` until that promise settles, then closes (a failed or no-op edit closes it too:
//     the hook says why through `problem`); the photo's own Edit button then has focus;
//   - Cancel, Escape and Close close it without calling applyEdit; the photo's Edit button has focus;
//   - while the sheet is open or while photos are being prepared, "Read the receipt" is disabled (readGate `editing`);
//   - Edit is disabled while a read runs and while photos are being prepared (with Remove, as `disabled` of the list), and is absent with no photo;
//   - leaving asks "Leave without reading?" whenever there are photos and no read runs, also with the sheet open or preparing.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { publishReceiptSession } from '../lib/receiptSession'
import type { UseReceiptPhotos } from '../hooks/useReceiptPhotos'
import type { UseReceiptRead } from '../hooks/useReceiptRead'

const photosRef = vi.hoisted(() => ({ current: {} as UseReceiptPhotos }))
const readRef = vi.hoisted(() => ({ current: {} as UseReceiptRead }))
const availRef = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('../hooks/useReceiptPhotos', () => ({ useReceiptPhotos: () => photosRef.current }))
vi.mock('../hooks/useReceiptRead', () => ({ useReceiptRead: () => readRef.current }))
vi.mock('../../import/hooks/useReadAvailability', () => ({ useReadAvailability: () => availRef.current }))
vi.mock('../../../app/useConnectivity', () => ({ useConnectivity: () => ({ offline: false, savedAt: null }) }))

import { ReceiptPhotosScreen } from './ReceiptPhotosScreen'

const photo = (n: number) => ({ id: `p${n}`, previewUrl: `blob:p/${n}`, dataUrl: `data:image/jpeg;base64,${n}`, width: 1500, height: 2000 })
function setPhotos(n: number, over: Partial<UseReceiptPhotos> = {}) {
  const list = Array.from({ length: n }, (_, i) => photo(i + 1))
  photosRef.current = {
    photos: list, count: n, canAdd: n < 4, busy: false, problem: undefined,
    add: vi.fn(async () => undefined), remove: vi.fn(), clear: vi.fn(), dismissProblem: vi.fn(),
    applyEdit: vi.fn(async () => true), toBody: vi.fn(() => list.map((p) => ({ dataUrl: p.dataUrl }))),
    ...over,
  } as UseReceiptPhotos
  return photosRef.current
}
function setRead(over: Partial<UseReceiptRead> = {}) {
  readRef.current = {
    phase: 'idle', busy: false, error: undefined, elapsedSeconds: 0, connectionLost: false, readId: undefined,
    start: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined), reset: vi.fn(), ...over,
  } as UseReceiptRead
}

const Where = () => <p data-testid="where">{useLocation().pathname}</p>
function show() {
  return render(
    <MemoryRouter initialEntries={['/scan', '/scan/receipt']} initialIndex={1}>
      <ToastProvider>
        <ConfirmProvider>
          <Routes>
            <Route path="/scan/receipt" element={<ReceiptPhotosScreen />} />
            <Route path="*" element={<p>elsewhere</p>} />
          </Routes>
          <Where />
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}
const edit = (n: number) => screen.getByRole('button', { name: `Edit photo ${n}` })
const readButton = () => screen.getByRole('button', { name: 'Read the receipt', hidden: true })
const sheet = (n: number) => screen.getByRole('dialog', { name: `Edit photo ${n}` })
const noSheet = () => expect(screen.queryByRole('dialog', { name: /^Edit photo/ })).toBeNull()

beforeEach(() => {
  publishReceiptSession({ shopId: 7, clientUuids: ['u1'] })
  availRef.current = { loading: false, enabled: true, isAdmin: false, statusFailed: false, settingsLink: false, photos: true, retry: vi.fn() }
  setRead()
  setPhotos(2)
})
afterEach(() => publishReceiptSession(undefined))

describe('opening the editor', () => {
  it('every photo row has an Edit button named "Edit photo N"; with no photo there is none', () => {
    setPhotos(3)
    const { unmount } = show()
    for (const n of [1, 2, 3]) expect(edit(n)).toBeEnabled()
    unmount()
    setPhotos(0)
    show()
    expect(screen.queryByRole('button', { name: /^Edit photo/ })).toBeNull()
  })

  it('opens a <dialog> named "Edit photo 2" with the free-aspect editor on that photo: crop, rotate left and right, Reset, Cancel, Use this', async () => {
    show()
    expect(screen.queryByRole('dialog', { name: /^Edit photo/ })).toBeNull()
    await userEvent.click(edit(2))
    const d = sheet(2)
    expect(d.tagName).toBe('DIALOG')
    expect(within(d).getByRole('group', { name: 'Crop image' })).toBeInTheDocument()
    expect(d.ownerDocument.querySelector('.crop-editor__image')).toHaveAttribute('src', 'blob:p/2')
    expect(within(d).getByRole('status')).toHaveTextContent('Crop area: 1500 by 2000 pixels')
    for (const name of ['Rotate left', 'Rotate right', 'Reset', 'Cancel', 'Use this']) expect(within(d).getByRole('button', { name })).toBeInTheDocument()
  })
})

describe('Use this', () => {
  it('hands the photo and its edit to applyEdit, then closes the sheet and focuses the photo\'s Edit button', async () => {
    const p = photosRef.current
    show()
    await userEvent.click(edit(2))
    await userEvent.click(within(sheet(2)).getByRole('button', { name: 'Rotate right' }))
    await userEvent.click(within(sheet(2)).getByRole('button', { name: 'Use this' }))
    expect(p.applyEdit).toHaveBeenCalledExactlyOnceWith('p2', { turns: 1, crop: { x: 0, y: 0, width: 2000, height: 1500 } })
    await waitFor(noSheet)
    expect(edit(2)).toHaveFocus()
  })

  it('stays open and busy while the edit is prepared: nothing to press, Escape does nothing', async () => {
    let finish!: (v: boolean) => void
    const p = photosRef.current
    vi.mocked(p.applyEdit).mockImplementation(() => new Promise<boolean>((r) => { finish = r }))
    show()
    await userEvent.click(edit(1))
    await userEvent.click(within(sheet(1)).getByRole('button', { name: 'Use this' }))
    expect(within(sheet(1)).getByRole('button', { name: 'Use this' })).toBeDisabled()
    expect(within(sheet(1)).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(sheet(1)).toBeInTheDocument()
    finish(true)
    await waitFor(noSheet)
    expect(edit(1)).toHaveFocus()
  })

  it('closes too when the edit failed or changed nothing (applyEdit false), and the Edit button has focus', async () => {
    vi.mocked(photosRef.current.applyEdit).mockResolvedValue(false)
    show()
    await userEvent.click(edit(2))
    await userEvent.click(within(sheet(2)).getByRole('button', { name: 'Use this' }))
    await waitFor(noSheet)
    expect(edit(2)).toHaveFocus()
  })
})

describe('Cancel', () => {
  it('Cancel closes the sheet, leaves the photo, and focuses the photo\'s Edit button', async () => {
    const p = photosRef.current
    show()
    await userEvent.click(edit(1))
    await userEvent.click(within(sheet(1)).getByRole('button', { name: 'Rotate right' }))
    await userEvent.click(within(sheet(1)).getByRole('button', { name: 'Cancel' }))
    noSheet()
    expect(p.applyEdit).not.toHaveBeenCalled()
    expect(p.remove).not.toHaveBeenCalled()
    expect(edit(1)).toHaveFocus()
  })
  it('Escape counts as Cancel', async () => {
    const p = photosRef.current
    show()
    await userEvent.click(edit(2))
    screen.getByRole('button', { name: 'Move crop area' }).focus()
    await userEvent.keyboard('{Escape}')
    noSheet()
    expect(p.applyEdit).not.toHaveBeenCalled()
    expect(edit(2)).toHaveFocus()
  })
  it("the sheet's Close counts as Cancel", async () => {
    const p = photosRef.current
    show()
    await userEvent.click(edit(2))
    await userEvent.click(within(sheet(2)).getByRole('button', { name: 'Close' }))
    noSheet()
    expect(p.applyEdit).not.toHaveBeenCalled()
    expect(edit(2)).toHaveFocus()
  })
  it('opening it again starts from the whole photo, not from the cancelled draft', async () => {
    show()
    await userEvent.click(edit(1))
    await userEvent.click(within(sheet(1)).getByRole('button', { name: 'Rotate right' }))
    await userEvent.click(within(sheet(1)).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(edit(1))
    expect(within(sheet(1)).getByRole('status')).toHaveTextContent('Crop area: 1500 by 2000 pixels')
  })
})

describe('while a photo is edited or prepared', () => {
  it('Read the receipt is disabled while the sheet is open, and enabled again after Cancel', async () => {
    show()
    expect(readButton()).toBeEnabled()
    await userEvent.click(edit(1))
    expect(readButton()).toBeDisabled()
    await userEvent.click(within(sheet(1)).getByRole('button', { name: 'Cancel' }))
    expect(readButton()).toBeEnabled()
  })
  it('Read the receipt is disabled while the edit is being prepared (photos.busy)', () => {
    setPhotos(2, { busy: true })
    show()
    expect(readButton()).toBeDisabled()
  })
  it('Edit is disabled while photos are being prepared', () => {
    setPhotos(2, { busy: true })
    show()
    expect(edit(1)).toBeDisabled()
    expect(edit(2)).toBeDisabled()
  })
  it('Edit is disabled while a read runs (the photos are being read), or the read button is gone with it', () => {
    setRead({ phase: 'running', busy: true })
    show()
    expect(edit(1)).toBeDisabled()
    expect(edit(2)).toBeDisabled()
  })
  it('leaving with the editor open asks "Leave without reading?" and keeps the photos until Leave', async () => {
    const p = photosRef.current
    show()
    await userEvent.click(edit(1))
    fireEvent.click(screen.getByRole('button', { name: 'Back', hidden: true }))
    const ask = await screen.findByRole('dialog', { name: 'Leave without reading?' })
    expect(ask).toHaveTextContent('The 2 photos are not kept.')
    expect(p.clear).not.toHaveBeenCalled()
    expect(screen.queryByText('elsewhere')).toBeNull()
    await userEvent.click(within(ask).getByRole('button', { name: 'Leave' }))
    expect(p.clear).toHaveBeenCalled()
    expect(await screen.findByText('elsewhere')).toBeInTheDocument()
  })
  it('leaving while an edit is being prepared asks the same question', async () => {
    setPhotos(2, { busy: true })
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('dialog', { name: 'Leave without reading?' })).toBeInTheDocument()
  })
})
