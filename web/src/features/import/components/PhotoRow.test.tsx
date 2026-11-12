// PhotoRow: one photo of the list (docs/dev/design/photo-read.md section 5, "PhotoRow"). Phase-1 reviewer condition 3: isSmallPhoto is never
// asked about a link or an as-is photo (their output is 0 x 0, which would read as "small").
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { heicPhoto, imagePhoto, linkPhoto } from '../fakePhotoPages.test-helper'
import type { Photo } from '../lib/photoPages'
import { PhotoRow } from './PhotoRow'

const SMALL = 'This photo is small. The text may be hard to read.'
const view = (photo: Photo, over: Partial<Parameters<typeof PhotoRow>[0]> = {}) => {
  const onEdit = vi.fn()
  const onRemove = vi.fn()
  const out = render(
    <ul>
      <li>
        <PhotoRow photo={photo} number={2} previewUrl="blob:preview/1" onEdit={onEdit} onRemove={onRemove} {...over} />
      </li>
    </ul>,
  )
  return { onEdit, onRemove, ...out }
}
const edit = (turns: 0 | 1 | 2 | 3, w: number, h: number) => ({ turns, crop: { x: 0, y: 0, width: w, height: h } })

describe('PhotoRow: an image photo', () => {
  it('shows "Photo 2", its preview, and Edit photo 2 / Remove photo 2', async () => {
    const { container, onEdit, onRemove } = view(imagePhoto('p1'))
    expect(screen.getByText('Photo 2')).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:preview/1')
    await userEvent.click(screen.getByRole('button', { name: 'Edit photo 2' }))
    expect(onEdit).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo 2' }))
    expect(onRemove).toHaveBeenCalledOnce()
  })
  it('renders the drag handle it is given', () => {
    view(imagePhoto('p1'), { handle: <button type="button">Reorder Photo 2</button> })
    expect(screen.getByRole('button', { name: 'Reorder Photo 2' })).toBeInTheDocument()
  })
  it('turns the buttons off when disabled', () => {
    view(imagePhoto('p1'), { disabled: true })
    expect(screen.getByRole('button', { name: 'Edit photo 2' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove photo 2' })).toBeDisabled()
  })
  it('says nothing special for a photo that was not edited', () => {
    const { container } = view(imagePhoto('p1'))
    expect(container.querySelector('li')!.textContent).not.toMatch(/Cropped|Turned|Preparing|small|sent as it is|link/i)
  })
  it.each([
    ['cropped', edit(0, 1000, 1000), 'Cropped'],
    ['turned (the whole turned picture)', edit(1, 1500, 2000), 'Turned'],
    ['cropped and turned', edit(1, 1000, 1000), 'Cropped and turned'],
  ])('a photo %s says "%s"', (_n, e, text) => {
    view(imagePhoto('p1', { edit: e }))
    expect(screen.getByText(text)).toBeInTheDocument()
  })
  it('a pending output says "Preparing…"', () => {
    view(imagePhoto('p1', { output: { status: 'pending' } }))
    expect(screen.getByText('Preparing…')).toBeInTheDocument()
  })
  it('warns of a small photo (long side under 1,000 px of what is sent)', () => {
    view(imagePhoto('p1', { output: { status: 'ready', blob: new Blob(['o']), width: 800, height: 600, type: 'image/jpeg' } }))
    expect(screen.getByText(SMALL)).toBeInTheDocument()
  })
  it('does not warn at 1,000 px', () => {
    view(imagePhoto('p1', { output: { status: 'ready', blob: new Blob(['o']), width: 1000, height: 600, type: 'image/jpeg' } }))
    expect(screen.queryByText(SMALL)).toBeNull()
  })
  it('does not warn while the output is not ready', () => {
    view(imagePhoto('p1', { output: { status: 'pending' } }))
    expect(screen.queryByText(SMALL)).toBeNull()
  })
})

describe('PhotoRow: a failed render', () => {
  it('shows the failure with the error glyph, keeps Edit and Remove', () => {
    const { container } = view(imagePhoto('p1', { output: { status: 'failed', problem: 'render_failed' } }))
    expect(screen.getByText('This photo could not be prepared. Edit it again or remove it.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit photo 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove photo 2' })).toBeInTheDocument()
    expect(container.querySelector('svg')).not.toBeNull()
  })
  it('still over 8 MB says to crop it smaller', () => {
    view(imagePhoto('p1', { output: { status: 'failed', problem: 'too_large' } }))
    expect(screen.getByText('This photo is still over 8 MB. Crop it smaller or remove it.')).toBeInTheDocument()
  })
  it('shows no small warning for a failed photo', () => {
    view(imagePhoto('p1', { output: { status: 'failed', problem: 'render_failed' } }))
    expect(screen.queryByText(SMALL)).toBeNull()
  })
})

describe('PhotoRow: a HEIC the browser cannot show (as-is)', () => {
  it('has no preview image, says it is sent as it is, offers no Edit, and never warns "small"', () => {
    const { container } = view(heicPhoto('p1'), { previewUrl: undefined })
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText("Will be sent as it is: this browser can't show HEIC photos.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit photo 2' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove photo 2' })).toBeInTheDocument()
    expect(screen.queryByText(SMALL)).toBeNull()
  })
})

describe('PhotoRow: a pasted link', () => {
  it('has no preview image, says "From a link", offers no Edit, and never warns "small" (its output is 0 x 0)', () => {
    const { container } = view(linkPhoto('p1'), { previewUrl: undefined })
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('From a link')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit photo 2' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove photo 2' })).toBeInTheDocument()
    expect(screen.queryByText(SMALL)).toBeNull()
  })
})
