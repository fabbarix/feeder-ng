// IM2 (F-09): the New Ingredient sheet has an optional Picture through the shared ImagePicker, 4:3 like a Recipe photo.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PICKED_ID } from '../../../ui/ImagePicker/fake.test-helper'
import { CROP_ASPECTS } from '../../../ui/ImagePicker/lib/crop'
import { strings } from '../strings'
import type { Ingredient } from '../types'
import { NewIngredientSheet } from './NewIngredientSheet'

vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

const created: Ingredient = { id: 99, name: 'Saffron', baseUnit: 'g', shelfLifeDays: null, conversions: [] }
const none = { exact: null, suggestions: [] }

function setup(initialName = 'Saffron') {
  const onCreate = vi.fn().mockResolvedValue(created)
  render(<NewIngredientSheet open onClose={vi.fn()} onCreate={onCreate} initialName={initialName} findSimilar={vi.fn().mockResolvedValue(none)} />)
  return onCreate
}
const picker = () => screen.getByRole('group', { name: strings.sheet.pictureLabel })
const create = () => userEvent.click(screen.getByRole('button', { name: strings.createIngredient }))

describe('NewIngredientSheet: Picture', () => {
  it('is an upload-mode ImagePicker labelled Picture with the landscape (4:3) crop, empty at first', () => {
    setup()
    expect(picker()).toHaveAttribute('data-mode', 'upload')
    expect(picker()).toHaveAttribute('data-aspect', String(CROP_ASPECTS.landscape))
    expect(picker()).toHaveAttribute('data-value', '')
  })

  it('comes after the Shelf Life field and before the action bar', () => {
    setup()
    const shelf = screen.getByLabelText(new RegExp(strings.sheet.shelfLifeLabel))
    expect(shelf.compareDocumentPosition(picker()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(picker().compareDocumentPosition(screen.getByRole('button', { name: strings.createIngredient })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('is optional: without a picture the body has no image key', async () => {
    const onCreate = setup()
    await create()
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate.mock.calls[0]![0]).toEqual({ name: 'Saffron', baseUnit: 'g' })
  })

  it('sends the image id of the picked picture with the new Ingredient', async () => {
    const onCreate = setup()
    await userEvent.click(screen.getByRole('button', { name: `pick ${strings.sheet.pictureLabel}` }))
    expect(picker()).toHaveAttribute('data-value', PICKED_ID)
    await create()
    expect(onCreate.mock.calls[0]![0]).toEqual({ name: 'Saffron', baseUnit: 'g', image: PICKED_ID })
  })

  it('removing the picture before creating sends no image', async () => {
    const onCreate = setup()
    await userEvent.click(screen.getByRole('button', { name: `pick ${strings.sheet.pictureLabel}` }))
    await userEvent.click(screen.getByRole('button', { name: `remove ${strings.sheet.pictureLabel}` }))
    await create()
    expect(onCreate.mock.calls[0]![0]).not.toHaveProperty('image')
  })

  it('has no file input of its own', () => {
    setup()
    expect(document.querySelector('input[type=file]')).toBeNull()
  })
})
