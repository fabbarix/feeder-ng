// PE: Create Ingredient is disabled while the Picture is uploading (ImagePicker onBusyChange), and works again afterwards.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { strings } from '../strings'
import { NewIngredientSheet } from './NewIngredientSheet'

vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

const label = strings.sheet.pictureLabel
const create = () => screen.getByRole('button', { name: strings.createIngredient })

describe('NewIngredientSheet: picture busy', () => {
  it('disables Create while the picture uploads and enables it when done', async () => {
    render(<NewIngredientSheet open onClose={vi.fn()} onCreate={vi.fn()} initialName="Saffron" findSimilar={vi.fn().mockResolvedValue({ exact: null, suggestions: [] })} />)
    expect(create()).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: `start upload ${label}` }))
    expect(create()).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: `finish upload ${label}` }))
    expect(create()).toBeEnabled()
  })
})
