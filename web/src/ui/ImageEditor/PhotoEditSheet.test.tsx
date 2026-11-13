// PhotoEditSheet: the shared sheet that edits ONE picture (free-aspect crop, turns, Reset, Cancel, Done) over ImageEditor.
// Used by the receipt photos (features/receipt) and available to Import. Pinned API of ./PhotoEditSheet (also exported from ./index and ../index):
//   <PhotoEditSheet
//     open: boolean                 mounted only while open (like BottomSheet); a modal <dialog>, named by `title` (its h2)
//     title: string                 "Edit photo 2"
//     src: string; width: number; height: number     the picture, in its own (un-turned) orientation: ImageEditor's props
//     minSide?: number              smallest crop side in picture pixels, default 160 (the read's minimum), passed to ImageEditor
//     busy?: boolean                the edit is being applied: Done, Cancel, Reset, the turns and the crop are disabled, Escape and Close do nothing
//     onDone(edit: ImageEdit): void     Done (primary): the draft, whatever it is (an untouched draft is the caller's no-op)
//     onCancel(): void              Cancel, Escape, the sheet's Close: the draft is dropped
//   />
//   The draft is the sheet's own (initialEdit(size, 'free')); it starts again, whole picture, every time the sheet opens.
//   Focus: on open, the crop box; on close the dialog returns focus to what opened it (BottomSheet's behaviour).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PhotoEditSheet, type PhotoEditSheetProps } from './PhotoEditSheet'
import * as editorBarrel from './index'
import * as uiBarrel from '../index'

function view(over: Partial<PhotoEditSheetProps> = {}) {
  const handlers = { onDone: vi.fn(), onCancel: vi.fn() }
  const out = render(<PhotoEditSheet open title="Edit photo 2" src="blob:p/2" width={1500} height={2000} {...handlers} {...over} />)
  return { ...handlers, ...out }
}
const dialog = () => screen.getByRole('dialog', { name: 'Edit photo 2' })

describe('PhotoEditSheet', () => {
  it('renders nothing while closed', () => {
    view({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is a modal <dialog> named by its title, holding the shared editor', () => {
    const { container } = view()
    expect(dialog().tagName).toBe('DIALOG')
    expect((dialog() as HTMLDialogElement).open).toBe(true)
    expect(within(dialog()).getByRole('heading', { level: 2, name: 'Edit photo 2' })).toBeInTheDocument()
    expect(within(dialog()).getByRole('group', { name: 'Crop image' })).toBeInTheDocument()
    expect(container.ownerDocument.querySelector('.crop-editor__image')).toHaveAttribute('src', 'blob:p/2')
    expect(within(dialog()).getAllByRole('button', { name: /^Resize crop, / })).toHaveLength(8)
  })

  it('has labelled Rotate left, Rotate right and Reset, and Cancel and Done (Done primary)', () => {
    view()
    for (const name of ['Rotate left', 'Rotate right', 'Reset', 'Cancel', 'Done']) expect(within(dialog()).getByRole('button', { name })).toBeInTheDocument()
    expect(within(dialog()).getByRole('button', { name: 'Done' })).toHaveAttribute('data-variant', 'primary')
  })

  it('starts on the whole picture, free aspect', () => {
    view()
    expect(within(dialog()).getByRole('status')).toHaveTextContent('Crop area: 1500 by 2000 pixels')
  })

  it('rotates in 90 degree steps: right turns the read-out, left turns it back', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Rotate right' }))
    expect(within(dialog()).getByRole('status')).toHaveTextContent('Crop area: 2000 by 1500 pixels')
    await userEvent.click(screen.getByRole('button', { name: 'Rotate left' }))
    expect(within(dialog()).getByRole('status')).toHaveTextContent('Crop area: 1500 by 2000 pixels')
  })

  it('Reset puts back the whole, unturned picture', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Rotate right' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(within(dialog()).getByRole('status')).toHaveTextContent('Crop area: 1500 by 2000 pixels')
  })

  it('Done hands over the draft: its turns and its crop in pixels of the turned picture', async () => {
    const { onDone, onCancel } = view()
    await userEvent.click(screen.getByRole('button', { name: 'Rotate right' }))
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onDone).toHaveBeenCalledOnce()
    expect(onDone).toHaveBeenCalledWith({ turns: 1, crop: { x: 0, y: 0, width: 2000, height: 1500 } })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('Done with nothing changed still reports the whole, unturned draft', async () => {
    const { onDone } = view()
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onDone).toHaveBeenCalledWith({ turns: 0, crop: { x: 0, y: 0, width: 1500, height: 2000 } })
  })

  it('Cancel hands over nothing', async () => {
    const { onDone, onCancel } = view()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('Escape cancels, once', async () => {
    const { onDone, onCancel } = view()
    screen.getByRole('button', { name: 'Move crop area' }).focus()
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onDone).not.toHaveBeenCalled()
  })

  it("the sheet's own Close cancels", async () => {
    const { onCancel } = view()
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Close' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it.each([
    [undefined, 160],
    [50, 50],
  ])('crops no smaller than the minimum side (minSide %s gives %s px; 160 by default, the read\'s minimum)', async (minSide, floor) => {
    view({ width: 2000, height: 1500, minSide })
    screen.getByRole('button', { name: 'Resize crop, right edge' }).focus()
    await userEvent.keyboard('{Shift>}' + '{ArrowLeft}'.repeat(12) + '{/Shift}')
    expect(within(dialog()).getByRole('status')).toHaveTextContent(`Crop area: ${floor} by 1500 pixels`)
  })

  it('focuses the crop box when it opens', () => {
    view()
    expect(screen.getByRole('button', { name: 'Move crop area' })).toHaveFocus()
  })

  it('busy disables the editor, Reset, Cancel and Done, and Escape does nothing', async () => {
    const { onCancel, onDone } = view({ busy: true })
    for (const name of ['Rotate left', 'Rotate right', 'Reset', 'Cancel', 'Done', 'Move crop area']) expect(within(dialog()).getByRole('button', { name })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(onCancel).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('starts again on the whole picture each time it opens, and returns focus to what opened it', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>Open editor</button>
          <PhotoEditSheet open={open} title="Edit photo 2" src="blob:p/2" width={1500} height={2000} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />
        </>
      )
    }
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open editor' })
    await userEvent.click(opener)
    await userEvent.click(screen.getByRole('button', { name: 'Rotate right' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
    await userEvent.click(opener)
    expect(within(dialog()).getByRole('status')).toHaveTextContent('Crop area: 1500 by 2000 pixels')
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(opener).toHaveFocus()
  })

  it('is exported from ui/ImageEditor and from ui', () => {
    expect(editorBarrel.PhotoEditSheet).toBe(PhotoEditSheet)
    expect(uiBarrel.PhotoEditSheet).toBe(PhotoEditSheet)
  })
})
