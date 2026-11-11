// IM2: the Recipe photo is the shared ImagePicker (upload mode, landscape 4:3); this component only places it in a Tile.
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
  it('is a Tile holding one upload-mode ImagePicker named after the field, with the landscape crop', () => {
    const { container } = render(<PhotoPicker value="" onChange={vi.fn()} />)
    expect(container.querySelector('section.photo-picker')).not.toBeNull()
    expect(within(container.querySelector('section')!).getByRole('group', { name: recipeStrings.photo })).toBe(picker())
    expect(picker()).toHaveAttribute('data-mode', 'upload')
    expect(picker()).toHaveAttribute('data-aspect', String(CROP_ASPECTS.landscape))
    expect(picker()).toHaveAttribute('data-size', 'hero')
  })
  it('hands the current image id to the picker and the picked id to onChange', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<PhotoPicker value="abc" onChange={onChange} />)
    expect(picker()).toHaveAttribute('data-value', 'abc')
    await userEvent.click(screen.getByRole('button', { name: `pick ${recipeStrings.photo}` }))
    expect(onChange).toHaveBeenCalledWith(PICKED_ID)
    await userEvent.click(screen.getByRole('button', { name: `remove ${recipeStrings.photo}` }))
    expect(onChange).toHaveBeenLastCalledWith('')
    rerender(<PhotoPicker value={PICKED_ID} onChange={onChange} />)
    expect(picker()).toHaveAttribute('data-value', PICKED_ID)
  })
  it('builds no file input, thumbnail or upload state of its own', () => {
    const { container } = render(<PhotoPicker value="abc" onChange={vi.fn()} />)
    expect(container.querySelector('input[type=file], .recipe-thumb, [data-testid=file-drop-zone]')).toBeNull()
  })
})
