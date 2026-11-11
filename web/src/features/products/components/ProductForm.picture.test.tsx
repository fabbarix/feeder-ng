// PP: the Product sheet's form has an optional Picture through the shared ImagePicker, 4:3 like the Ingredient picture.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PICKED_ID } from '../../../ui/ImagePicker/fake.test-helper'
import { CROP_ASPECTS } from '../../../ui/ImagePicker/lib/crop'
import { strings } from '../strings'
import { ProductForm } from './ProductForm'

vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

function setup() {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<ProductForm ingredientId={3} ingredientName="tomato passata" baseUnit="g" onSubmit={onSubmit} />)
  return onSubmit
}
const picker = () => screen.getByRole('group', { name: strings.pictureLabel })

describe('ProductForm: Picture', () => {
  it('is an upload-mode ImagePicker labelled Picture with the landscape (4:3) crop, empty at first', () => {
    setup()
    expect(picker()).toHaveAttribute('data-mode', 'upload')
    expect(picker()).toHaveAttribute('data-aspect', String(CROP_ASPECTS.landscape))
    expect(picker()).toHaveAttribute('data-value', '')
  })

  it('comes after the Barcode field and before Save Product', () => {
    setup()
    const barcode = screen.getByLabelText(strings.barcodeLabel)
    expect(barcode.compareDocumentPosition(picker()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(picker().compareDocumentPosition(screen.getByRole('button', { name: strings.saveProduct })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('submits the picked picture id with the body', async () => {
    const user = userEvent.setup()
    const onSubmit = setup()
    await user.type(screen.getByLabelText(strings.packSizeLabel('g')), '700')
    await user.click(screen.getByRole('button', { name: `pick ${strings.pictureLabel}` }))
    expect(picker()).toHaveAttribute('data-value', PICKED_ID)
    await user.click(screen.getByRole('button', { name: strings.saveProduct }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Tomato passata 700 g', ingredientId: 3, packSize: 700, barcodes: [], image: PICKED_ID }))
  })

  it('leaves the image out of the body when none was picked, or when it was removed again', async () => {
    const user = userEvent.setup()
    const onSubmit = setup()
    await user.type(screen.getByLabelText(strings.packSizeLabel('g')), '700')
    await user.click(screen.getByRole('button', { name: `pick ${strings.pictureLabel}` }))
    await user.click(screen.getByRole('button', { name: `remove ${strings.pictureLabel}` }))
    await user.click(screen.getByRole('button', { name: strings.saveProduct }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Tomato passata 700 g', ingredientId: 3, packSize: 700, barcodes: [] }))
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('image')
  })

  it('does not block saving: the picture is optional', async () => {
    const user = userEvent.setup()
    const onSubmit = setup()
    await user.type(screen.getByLabelText(strings.packSizeLabel('g')), '700')
    await user.click(screen.getByRole('button', { name: strings.saveProduct }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
  })
})
