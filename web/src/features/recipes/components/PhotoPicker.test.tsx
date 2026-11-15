// IM2 + B9-37 (RX-02): the Recipe photo is one 96 px button beside the Name ("Photo of the Recipe: add" / "…: change") that opens the
// shared ImagePicker (upload mode, landscape 4:3) in a sheet named "Photo". The component builds no upload state of its own.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PICKED_ID } from '../../../ui/ImagePicker/fake.test-helper'
import { CROP_ASPECTS } from '../../../ui/ImagePicker/lib/crop'
import { recipeStrings } from '../strings'
import { PhotoPicker } from './PhotoPicker'

vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

const picker = () => screen.getByRole('group', { name: recipeStrings.photo })

describe('PhotoPicker', () => {
  it('is one button, named by what it does; no picker is drawn until it is pressed', () => {
    const { rerender } = render(<PhotoPicker value="" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Photo of the Recipe: add' })).toHaveAttribute('aria-haspopup', 'dialog')
    expect(screen.queryByRole('group', { name: recipeStrings.photo })).toBeNull()
    rerender(<PhotoPicker value="abc" onChange={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Photo of the Recipe: change' })
    expect(button.querySelector('img')).toHaveAttribute('src', '/api/images/abc')
  })
  it('opens a sheet "Photo" holding one upload-mode ImagePicker with the landscape crop', async () => {
    render(<PhotoPicker value="" onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Photo of the Recipe: add' }))
    const dialog = screen.getByRole('dialog', { name: recipeStrings.photo })
    expect(within(dialog).getByRole('group', { name: recipeStrings.photo })).toBe(picker())
    expect(picker()).toHaveAttribute('data-mode', 'upload')
    expect(picker()).toHaveAttribute('data-aspect', String(CROP_ASPECTS.landscape))
    expect(picker()).toHaveAttribute('data-size', 'hero')
  })
  it('hands the current image id to the picker and the picked id to onChange', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<PhotoPicker value="abc" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Photo of the Recipe: change' }))
    expect(picker()).toHaveAttribute('data-value', 'abc')
    await userEvent.click(screen.getByRole('button', { name: `pick ${recipeStrings.photo}` }))
    expect(onChange).toHaveBeenCalledWith(PICKED_ID)
    await userEvent.click(screen.getByRole('button', { name: `remove ${recipeStrings.photo}` }))
    expect(onChange).toHaveBeenLastCalledWith('')
    rerender(<PhotoPicker value={PICKED_ID} onChange={onChange} />)
    expect(picker()).toHaveAttribute('data-value', PICKED_ID)
  })
  it('closing the sheet during an upload tells the editor the upload is over', async () => {
    const onBusyChange = vi.fn()
    render(<PhotoPicker value="" onChange={vi.fn()} onBusyChange={onBusyChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Photo of the Recipe: add' }))
    await userEvent.click(screen.getByRole('button', { name: `start upload ${recipeStrings.photo}` }))
    expect(onBusyChange).toHaveBeenLastCalledWith(true)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onBusyChange).toHaveBeenLastCalledWith(false)
  })
  it('builds no file input, thumbnail or upload state of its own', async () => {
    const { container } = render(<PhotoPicker value="abc" onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Photo of the Recipe: change' }))
    expect(container.querySelector('input[type=file], .recipe-thumb, [data-testid=file-drop-zone]')).toBeNull()
    expect(document.querySelector('input[type=file], [data-testid=file-drop-zone]')).toBeNull()
  })
})
