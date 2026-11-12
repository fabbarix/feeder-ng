// ReadPhotoPanel: the Photo tab (docs/dev/design/photo-read.md section 5, "ReadPhotoPanel"; section 6; photo-store.md "Copy" and "Remove").
// The panel takes UsePhotoPages as a prop; here it is a fake. Its parts (sources, list, editor) are real.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { problemMessage } from '../../../ui'
import { fakePages, heicPhoto, imagePhoto, linkPhoto, type FakePagesInput } from '../fakePhotoPages.test-helper'
import { ReadPhotoPanel } from './ReadPhotoPanel'

const draft = { turns: 0 as const, crop: { x: 0, y: 0, width: 2000, height: 1500 } }
const editingNew = (origin: 'file' | 'camera' = 'file'): FakePagesInput => ({
  state: { photos: [imagePhoto('p1', { output: { status: 'pending' } }, origin)], editing: { id: 'p1', draft, isNew: true } },
})
const view = (over: FakePagesInput = {}, disabled?: boolean) => {
  const pages = fakePages(over)
  const out = render(<ReadPhotoPanel pages={pages} disabled={disabled} />)
  const again = (next: FakePagesInput) => {
    const p = fakePages(next)
    out.rerender(<ReadPhotoPanel pages={p} disabled={disabled} />)
    return p
  }
  return { pages, again, ...out }
}
const asPhone = () =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('pointer: coarse'), media: q, addEventListener() {}, removeEventListener() {} }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ReadPhotoPanel: the notes and the group', () => {
  it('is a group named "Photos" with what to photograph, who sees the photos, and that they stay on this device', () => {
    view()
    expect(screen.getByRole('group', { name: 'Photos' })).toBeInTheDocument()
    expect(screen.getByText('A cookbook page or a handwritten card. Up to 4 photos, in page order.')).toBeInTheDocument()
    expect(screen.getByText('Photos are sent to Anthropic to read the recipe. They are only kept if you choose to use one for the Recipe.')).toBeInTheDocument()
    expect(screen.getByText('Photos stay on this device until the read is finished.')).toBeInTheDocument()
  })

  it('reads the notes before the sources', () => {
    view()
    const note = screen.getByText('Photos stay on this device until the read is finished.')
    expect(note.compareDocumentPosition(screen.getByRole('button', { name: 'Choose files' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('has no native file input of its own besides the sources\' hidden ones, and no ImagePicker group per photo', () => {
    view({ state: { photos: [imagePhoto('p1')] } })
    expect(screen.queryByRole('group', { name: 'Photo 1' })).toBeNull()
  })
})

describe('ReadPhotoPanel: the list and the sources', () => {
  it('with no photo shows the sources only: no list, no count', () => {
    view()
    expect(screen.getByRole('button', { name: 'Choose files' })).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByText(/of 4 photos/)).toBeNull()
  })

  it('with photos shows the count "2 of 4 photos", the list in page order and the sources', () => {
    view({ state: { photos: [imagePhoto('p1'), heicPhoto('p2')] } })
    expect(screen.getByText('2 of 4 photos')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Photos in page order' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose files' })).toBeEnabled()
  })

  it('at 4 photos every source is off, with the reason', () => {
    view({ state: { photos: [imagePhoto('p1'), imagePhoto('p2'), heicPhoto('p3'), linkPhoto('p4')] } })
    expect(screen.getByText('4 of 4 photos')).toBeInTheDocument()
    const choose = screen.getByRole('button', { name: 'Choose files' })
    expect(choose).toBeDisabled()
    expect(choose).toHaveAccessibleDescription("That's 4 photos, the most a read takes.")
  })

  it('on a phone: Take photo and Choose photos', () => {
    asPhone()
    view()
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose photos' })).toBeInTheDocument()
  })

  it('files chosen or dropped go to addFiles with their origin', async () => {
    const { pages, container } = view()
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    await userEvent.upload(container.querySelector('input[type=file]')!, file)
    expect(pages.addFiles).toHaveBeenCalledWith([file], 'file')
  })

  it('a paste anywhere in the panel goes to onPaste with the clipboard data', () => {
    const { pages } = view()
    const clipboardData = { files: [], getData: () => 'https://example.com/a.jpg' }
    fireEvent.paste(screen.getByRole('group', { name: 'Photos' }), { clipboardData })
    expect(pages.onPaste).toHaveBeenCalledOnce()
    expect(vi.mocked(pages.onPaste).mock.calls[0]![0]).toMatchObject({ getData: expect.any(Function) })
  })

  it('wires the rows: Edit photo, Remove photo', async () => {
    const { pages } = view({ state: { photos: [imagePhoto('p1'), imagePhoto('p2')] } })
    await userEvent.click(screen.getByRole('button', { name: 'Edit photo 2' }))
    expect(pages.edit).toHaveBeenCalledWith('p2')
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }))
    expect(pages.remove).toHaveBeenCalledWith('p1')
  })

  it('the preview of a row comes from previewUrl(id)', () => {
    const { pages, container } = view({ state: { photos: [imagePhoto('p1')] } })
    expect(pages.previewUrl).toHaveBeenCalledWith('p1')
    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:preview/p1')
  })

  it('is locked as a whole while the step is locked', () => {
    view({ state: { photos: [imagePhoto('p1')] } }, true)
    expect(screen.getByRole('button', { name: 'Choose files' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove photo 1' })).toBeDisabled()
  })

  it('after the last photo is removed, focus goes to the first source', async () => {
    const { pages, again } = view({ state: { photos: [imagePhoto('p1')] } })
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }))
    expect(pages.remove).toHaveBeenCalledWith('p1')
    again({ state: { photos: [] } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose files' })).toHaveFocus())
  })
})

describe('ReadPhotoPanel: the editor replaces the list', () => {
  it('while a photo is being edited, shows the editor for it and neither the list nor the sources', () => {
    view({ ...editingNew(), state: { ...editingNew().state, photos: [imagePhoto('p0'), imagePhoto('p1', { output: { status: 'pending' } })], editing: { id: 'p1', draft, isNew: true } } })
    expect(screen.getByRole('heading', { name: 'Edit photo 2', level: 3 })).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Choose files' })).toBeNull()
  })

  it('edits the working copy: the editor\'s picture is editorUrl', () => {
    const { container } = view(editingNew())
    expect(container.querySelector('.crop-editor img')).toHaveAttribute('src', 'blob:editor/1')
  })

  it('wires Use photo, Cancel and the draft', async () => {
    const { pages } = view(editingNew())
    await userEvent.click(screen.getByRole('button', { name: 'Rotate right' }))
    expect(pages.setDraft).toHaveBeenCalledWith(expect.objectContaining({ turns: 1 }))
    await userEvent.click(screen.getByRole('button', { name: 'Use photo' }))
    expect(pages.commit).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(pages.cancel).toHaveBeenCalledOnce()
  })

  it('warns in the editor when the photo that would be sent is small (the draft crop under 1,000 px)', () => {
    view({ state: { ...editingNew().state, editing: { id: 'p1', draft: { turns: 0, crop: { x: 0, y: 0, width: 600, height: 400 } }, isNew: true } } })
    expect(screen.getByText('This photo is small. The text may be hard to read.')).toBeInTheDocument()
  })

  it('a photo just taken with the camera offers Retake, which cancels it and opens the camera again', async () => {
    asPhone()
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    const { pages, again } = view(editingNew('camera'))
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Retake' }))
    expect(pages.cancel).toHaveBeenCalledOnce()
    again({ state: { photos: [], editing: null } })
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect((click.mock.contexts.at(-1) as HTMLInputElement).getAttribute('capture')).toBe('environment')
  })

  it('a photo that was chosen from files offers Cancel, not Retake', () => {
    view(editingNew('file'))
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retake' })).toBeNull()
  })

  it('an existing photo opened again offers Cancel even if it came from the camera', () => {
    view({ state: { photos: [imagePhoto('p1', {}, 'camera')], editing: { id: 'p1', draft, isNew: false } } })
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retake' })).toBeNull()
  })
})

describe('ReadPhotoPanel: messages', () => {
  const problem = (p: NonNullable<FakePagesInput['state']>['problem']) => ({ state: { problem: p } })

  it.each([
    [{ code: 'unsupported' as const }, 'That is not a JPEG, PNG, WebP or HEIC photo.'],
    [{ code: 'unreadable' as const }, "This browser can't read that photo. Try a JPEG or PNG."],
    [{ code: 'empty' as const }, 'That file is empty.'],
    [{ code: 'too_many_pixels' as const }, 'That photo has more than 50 megapixels. Use a smaller photo.'],
    [{ code: 'too_large' as const, limit: 'original' as const }, 'That photo is larger than 30 MB. Use a smaller photo.'],
    [
      { code: 'too_large' as const, limit: 'as-is' as const },
      "This browser can't show HEIC photos, so it would be sent as it is, and it is larger than 8 MB. Use a smaller photo, or open Feeder in Safari.",
    ],
    [{ code: 'too_many_photos' as const, count: 2 }, 'A read takes up to 4 photos. The first ones were kept; 2 were left out.'],
    [{ code: 'render_failed' as const }, 'This photo could not be prepared. Edit it again or remove it.'],
    [{ code: 'link_invalid' as const }, problemMessage('link_invalid')],
    [{ code: 'link_empty' as const }, problemMessage('link_empty')],
    [{ code: 'clipboard_empty' as const }, problemMessage('clipboard_empty')],
  ])('says %j as "%s" in an alert', (p, text) => {
    view(problem(p))
    expect(screen.getByRole('alert')).toHaveTextContent(text)
  })

  it('has a Dismiss button that dismisses it', async () => {
    const { pages } = view(problem({ code: 'unsupported' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(pages.dismissProblem).toHaveBeenCalledOnce()
  })

  it('moves focus to the message when a refusal appears', () => {
    const { again } = view()
    again(problem({ code: 'unsupported' }))
    expect(screen.getByRole('alert')).toHaveFocus()
  })

  it('shows no alert when nothing went wrong', () => {
    view({ state: { photos: [imagePhoto('p1')] } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says only "photo" and uses none of the avoided words', () => {
    view(problem({ code: 'too_large', limit: 'original' }))
    expect(document.body.textContent).not.toMatch(/upload|thumbnail|discard|\bimage\b|\bdone\b/i)
  })
})

describe('ReadPhotoPanel: busy', () => {
  it('is aria-busy while preparing, and says "Preparing the photo…" only after 300 ms', () => {
    vi.useFakeTimers()
    view({ busy: true })
    expect(screen.getByRole('group', { name: 'Photos' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('Preparing the photo…')).toBeNull()
    act(() => void vi.advanceTimersByTime(300))
    expect(screen.getByText('Preparing the photo…')).toBeInTheDocument()
  })
  it('is not busy otherwise', () => {
    view()
    expect(screen.getByRole('group', { name: 'Photos' })).not.toHaveAttribute('aria-busy', 'true')
  })
})

describe('ReadPhotoPanel: photos from before', () => {
  it('says "2 photos from before are back." with a Remove button that removes them all', async () => {
    const { pages } = view({ restoredCount: 2, state: { photos: [imagePhoto('p1'), imagePhoto('p2')] } })
    expect(screen.getByText('2 photos from before are back.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(pages.removeRestored).toHaveBeenCalledOnce()
    expect(pages.remove).not.toHaveBeenCalled()
  })
  it('says "1 photo from before is back."', () => {
    view({ restoredCount: 1, state: { photos: [imagePhoto('p1')] } })
    expect(screen.getByText('1 photo from before is back.')).toBeInTheDocument()
  })
  it('says nothing when none came back', () => {
    view({ restoredCount: 0, state: { photos: [imagePhoto('p1')] } })
    expect(screen.queryByText(/from before/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
  })
  it('is shown with the list, not while an editor is open', () => {
    view({ restoredCount: 1, ...editingNew() })
    expect(screen.queryByText(/from before/)).toBeNull()
  })
})
