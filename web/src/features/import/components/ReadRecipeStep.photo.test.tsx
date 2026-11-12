// The Photo tab inside "Read a recipe" (docs/dev/design/photo-read.md section 5, "ReadRecipeStep changes"; photo-store.md "Finished read" and "State owner").
// usePhotoPages is replaced by a controllable fake; the step, the photo panel and its parts are real.
// Choices pinned where the design leaves room: the step spots a successful finish as busy -> idle with no failure and no Cancel pressed in between.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { heicPhoto, imagePhoto, rawPhoto, setPages } from '../fakePhotoPages.test-helper'
import type { UseRecipeRead } from '../hooks/useRecipeRead'
import type { ReadAvailability } from '../lib/readAvailability'

vi.mock('../hooks/usePhotoPages', async () => (await import('../fakePhotoPages.test-helper')).fakePhotoPagesModule())

import { ReadRecipeStep } from './ReadRecipeStep'

const idle = (over: Partial<UseRecipeRead> = {}): UseRecipeRead => ({
  phase: 'idle', busy: false, kind: undefined, state: undefined, error: undefined, elapsedSeconds: 0,
  start: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined), reset: vi.fn(), ...over,
})
const avail = (over: Partial<ReadAvailability> = {}): ReadAvailability => ({ loading: false, enabled: true, isAdmin: false, statusFailed: false, settingsLink: false, photos: true, ...over })
const ui = (read: UseRecipeRead, availability = avail()) => (
  <MemoryRouter><ReadRecipeStep read={read} availability={availability} /></MemoryRouter>
)
const readButton = () => screen.getByRole('button', { name: 'Read recipe' })
const photoTab = () => screen.getByRole('radio', { name: 'Photo' })
const openPhoto = async () => userEvent.click(photoTab())
const running = (over: Partial<UseRecipeRead> = {}) => idle({ phase: 'running', busy: true, kind: 'photo', state: 'reading', ...over })

beforeEach(() => void setPages())

describe('Photo tab', () => {
  it('shows the photo panel and keeps Read recipe off until the photos can be read', async () => {
    render(ui(idle()))
    await openPhoto()
    expect(screen.getByRole('group', { name: 'Photos' })).toBeInTheDocument()
    expect(readButton()).toBeDisabled()
  })

  it('Read recipe starts a photo read with what toReadInput() made now, in list order', async () => {
    const photos = [rawPhoto('data:image/jpeg;base64,AAAA'), rawPhoto('data:image/jpeg;base64,BBBB')]
    const pages = setPages({ canRead: true, state: { photos: [imagePhoto('p1'), imagePhoto('p2')] }, toReadInput: vi.fn(async () => ({ kind: 'photo' as const, photos })) })
    const read = idle()
    render(ui(read))
    await openPhoto()
    expect(readButton()).toBeEnabled()
    await userEvent.click(readButton())
    await waitFor(() => expect(read.start).toHaveBeenCalledWith({ kind: 'photo', photos }))
    expect(pages.toReadInput).toHaveBeenCalledOnce()
  })

  it('does not read twice from one press', async () => {
    const read = idle()
    const pages = setPages({ canRead: true, state: { photos: [imagePhoto('p1')] } })
    render(ui(read))
    await openPhoto()
    await userEvent.dblClick(readButton())
    await waitFor(() => expect(read.start).toHaveBeenCalled())
    expect(pages.toReadInput).toHaveBeenCalledTimes(1)
  })

  it('Try again after a failed read sends the same input again, without making the data URLs again', async () => {
    const pages = setPages({ canRead: true, state: { photos: [imagePhoto('p1')] } })
    const read = idle()
    const { rerender } = render(ui(read))
    await openPhoto()
    await userEvent.click(readButton())
    await waitFor(() => expect(read.start).toHaveBeenCalledOnce())
    const first = vi.mocked(read.start).mock.calls[0]![0]
    const failed = idle({ start: read.start, phase: 'failed', kind: 'photo', error: { code: 'assistant_unreachable' } })
    rerender(ui(failed))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(read.start).toHaveBeenCalledTimes(2)
    expect(vi.mocked(read.start).mock.calls[1]![0]).toBe(first)
    expect(pages.toReadInput).toHaveBeenCalledTimes(1)
    expect(pages.finished).not.toHaveBeenCalled()
  })

  it('shows the input choice with the Photo choice selected and the photos locked while a photo read runs', async () => {
    setPages({ state: { photos: [imagePhoto('p1')] } })
    render(ui(running()))
    expect(photoTab()).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'Remove photo 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit photo 1' })).toBeDisabled()
  })
})

describe('Photo tab: why Read recipe is off', () => {
  const reason = async (state: Parameters<typeof setPages>[0]) => {
    setPages({ canRead: false, ...state })
    render(ui(idle()))
    await openPhoto()
    expect(readButton()).toBeDisabled()
    return readButton()
  }
  it('an open editor: "Finish editing the photo first."', async () => {
    const button = await reason({
      state: { photos: [imagePhoto('p1')], editing: { id: 'p1', draft: { turns: 0, crop: { x: 0, y: 0, width: 2000, height: 1500 } }, isNew: true } },
    })
    expect(button).toHaveAccessibleDescription('Finish editing the photo first.')
  })
  it('a photo or a file still being prepared: "Preparing the photos…"', async () => {
    const button = await reason({ busy: true, state: { photos: [imagePhoto('p1')], queue: [new File(['x'], 'b.jpg')] } })
    expect(button).toHaveAccessibleDescription('Preparing the photos…')
  })
  it('a render that failed: "Photo 2 could not be prepared. Edit it again or remove it." with the photo\'s position', async () => {
    const button = await reason({
      state: { photos: [imagePhoto('p1'), imagePhoto('p7', { output: { status: 'failed', problem: 'render_failed' } })] },
    })
    expect(button).toHaveAccessibleDescription('Photo 2 could not be prepared. Edit it again or remove it.')
  })
  it('no reason is shown when Read recipe is on', async () => {
    setPages({ canRead: true, state: { photos: [heicPhoto('p1')] } })
    render(ui(idle()))
    await openPhoto()
    expect(readButton()).toBeEnabled()
    expect(readButton()).not.toHaveAccessibleDescription(/photo/i)
  })
})

describe('Photo tab: the photos are kept until the read is finished', () => {
  it('a read that ends without a failure and without Cancel (it reached review) calls finished()', () => {
    const pages = setPages({ state: { photos: [imagePhoto('p1')] } })
    const read = idle()
    const { rerender } = render(ui(running({ start: read.start })))
    rerender(ui(idle({ start: read.start })))
    expect(pages.finished).toHaveBeenCalledOnce()
  })

  it('a failed read keeps the photos (and Try again does too)', () => {
    const pages = setPages({ state: { photos: [imagePhoto('p1')] } })
    const { rerender } = render(ui(running()))
    rerender(ui(idle({ phase: 'failed', kind: 'photo', error: { code: 'assistant_unreachable' } })))
    expect(pages.finished).not.toHaveBeenCalled()
    expect(pages.removeRestored).not.toHaveBeenCalled()
  })

  it('Cancel keeps the photos', async () => {
    const pages = setPages({ state: { photos: [imagePhoto('p1')] } })
    const read = running()
    const { rerender } = render(ui(read))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(read.cancel).toHaveBeenCalledOnce()
    rerender(ui(idle()))
    expect(pages.finished).not.toHaveBeenCalled()
  })

  it('a text or page read that finishes does not touch the photos', () => {
    const pages = setPages({ state: { photos: [imagePhoto('p1')] } })
    const { rerender } = render(ui(running({ kind: 'text' })))
    rerender(ui(idle()))
    expect(pages.finished).not.toHaveBeenCalled()
  })

  it('switching tabs neither clears nor restores: the photos are owned at the step, not by the panel', async () => {
    const pages = setPages({ state: { photos: [imagePhoto('p1')] } })
    render(ui(idle()))
    await openPhoto()
    await userEvent.click(screen.getByRole('radio', { name: 'Text' }))
    await userEvent.click(photoTab())
    expect(screen.getByRole('button', { name: 'Remove photo 1' })).toBeInTheDocument()
    for (const fn of [pages.finished, pages.remove, pages.removeRestored, pages.cancel]) expect(fn).not.toHaveBeenCalled()
  })
})

describe('Photo tab: photos that came back from the device', () => {
  it('opens on the Photo tab when the device held photos', () => {
    setPages({ restoredCount: 0 })
    const read = idle()
    const { rerender } = render(ui(read))
    expect(screen.getByRole('radio', { name: 'Web page' })).toHaveAttribute('aria-checked', 'true')
    setPages({ restoredCount: 2, state: { photos: [imagePhoto('p1'), imagePhoto('p2')] } })
    rerender(ui(read))
    expect(photoTab()).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('2 photos from before are back.')).toBeInTheDocument()
  })

  it('only once: the User can still choose another tab afterwards', async () => {
    const read = idle()
    const { rerender } = render(ui(read))
    setPages({ restoredCount: 2, state: { photos: [imagePhoto('p1'), imagePhoto('p2')] } })
    rerender(ui(read))
    await userEvent.click(screen.getByRole('radio', { name: 'Text' }))
    rerender(ui(read))
    expect(screen.getByRole('radio', { name: 'Text' })).toHaveAttribute('aria-checked', 'true')
  })

  it('stays on Web page when this model cannot read photos', () => {
    const read = idle()
    const { rerender } = render(ui(read, avail({ photos: false, photosMessage: "This model can't read photos." })))
    setPages({ restoredCount: 1, state: { photos: [imagePhoto('p1')] } })
    rerender(ui(read, avail({ photos: false, photosMessage: "This model can't read photos." })))
    expect(screen.getByRole('radio', { name: 'Web page' })).toHaveAttribute('aria-checked', 'true')
  })
})
