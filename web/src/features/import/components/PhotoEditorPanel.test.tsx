// PhotoEditorPanel: the inline editor of one photo (docs/dev/design/photo-read.md D10, section 5 "PhotoEditorPanel", section 6 "Editor").
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ImageEdit } from '../../../ui'
import { PhotoEditorPanel } from './PhotoEditorPanel'

const draft: ImageEdit = { turns: 0, crop: { x: 0, y: 0, width: 2000, height: 1500 } }
function view(over: Partial<Parameters<typeof PhotoEditorPanel>[0]> = {}) {
  const handlers = { onChange: vi.fn(), onUse: vi.fn(), onCancel: vi.fn(), onRetake: vi.fn() }
  const out = render(
    <PhotoEditorPanel session={{ id: 'p1', draft, isNew: false }} number={2} src="blob:editor/1" size={{ width: 2000, height: 1500 }} small={false} canRetake={false} {...handlers} {...over} />,
  )
  return { ...handlers, ...out }
}

describe('PhotoEditorPanel', () => {
  it('is headed "Edit photo 2" and the heading takes focus when it opens', () => {
    view()
    const heading = screen.getByRole('heading', { name: 'Edit photo 2', level: 3 })
    expect(heading).toHaveFocus()
  })

  it('holds the shared editor: the picture, the crop box, the eight handles, the read-out, Rotate left, Rotate right and Reset', () => {
    const { container } = view()
    expect(screen.getByRole('group', { name: 'Crop image' })).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:editor/1')
    expect(screen.getByRole('button', { name: 'Move crop area' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Resize crop, / })).toHaveLength(8)
    expect(screen.getByRole('status')).toHaveTextContent('Crop area: 2000 by 1500 pixels')
    for (const name of ['Rotate left', 'Rotate right', 'Reset']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
  })

  it('shows the draft it is given (controlled): a turned draft reads out its crop', () => {
    view({ session: { id: 'p1', draft: { turns: 1, crop: { x: 0, y: 0, width: 900, height: 1200 } }, isNew: false } })
    expect(screen.getByRole('status')).toHaveTextContent('Crop area: 900 by 1200 pixels')
  })

  it('reports a turn through onChange', async () => {
    const { onChange } = view()
    await userEvent.click(screen.getByRole('button', { name: 'Rotate right' }))
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange.mock.calls[0]![0]).toMatchObject({ turns: 1 })
  })

  it('crops no smaller than 160 px a side (the read\'s minimum, not the editor\'s 16)', async () => {
    const { onChange } = view({ session: { id: 'p1', draft: { turns: 0, crop: { x: 0, y: 0, width: 200, height: 200 } }, isNew: false } })
    screen.getByRole('button', { name: 'Resize crop, right edge' }).focus()
    await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}')
    expect(onChange.mock.calls.at(-1)![0].crop.width).toBe(160)
  })

  it('Use photo (primary) keeps the draft', async () => {
    const { onUse } = view()
    const use = screen.getByRole('button', { name: 'Use photo' })
    expect(use).toHaveAttribute('data-variant', 'primary')
    await userEvent.click(use)
    expect(onUse).toHaveBeenCalledOnce()
  })

  it('offers Cancel for an existing photo or one that did not come from the camera, and no Retake', async () => {
    const { onCancel } = view()
    expect(screen.queryByRole('button', { name: 'Retake' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('offers Retake instead of Cancel for a photo just taken with the camera', async () => {
    const { onRetake, onCancel } = view({ canRetake: true, session: { id: 'p1', draft, isNew: true } })
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Retake' }))
    expect(onRetake).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it.each([false, true])('Escape cancels (canRetake %s)', async (canRetake) => {
    const { onCancel } = view({ canRetake })
    screen.getByRole('button', { name: 'Move crop area' }).focus()
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('warns when the photo that would be sent is small, and only then', () => {
    const { rerender } = view()
    expect(screen.queryByText('This photo is small. The text may be hard to read.')).toBeNull()
    rerender(
      <PhotoEditorPanel session={{ id: 'p1', draft, isNew: false }} number={2} src="blob:editor/1" size={{ width: 2000, height: 1500 }} small canRetake={false} onChange={vi.fn()} onUse={vi.fn()} onCancel={vi.fn()} onRetake={vi.fn()} />,
    )
    expect(screen.getByText('This photo is small. The text may be hard to read.')).toBeInTheDocument()
  })
})
