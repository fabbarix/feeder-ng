// PE: Save Product is disabled while the Picture is uploading (ImagePicker onBusyChange), and works again afterwards.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { strings } from '../strings'
import { ProductForm } from './ProductForm'

vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

describe('ProductForm: picture busy', () => {
  it('disables Save Product while the picture uploads and enables it when done', async () => {
    render(<ProductForm ingredientId={3} ingredientName="tomato passata" baseUnit="g" onSubmit={vi.fn().mockResolvedValue(undefined)} />)
    const save = () => screen.getByRole('button', { name: strings.saveProduct })
    expect(save()).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: `start upload ${strings.pictureLabel}` }))
    expect(save()).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: `finish upload ${strings.pictureLabel}` }))
    expect(save()).toBeEnabled()
  })
})
