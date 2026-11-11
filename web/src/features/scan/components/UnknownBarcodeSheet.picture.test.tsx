// PP: the "what is this?" sheet has an optional Picture through the shared ImagePicker (4:3), because it creates the Product.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PICKED_ID } from '../../../ui/ImagePicker/fake.test-helper'
import { CROP_ASPECTS } from '../../../ui/ImagePicker/lib/crop'
import type { UnknownMode } from '../lib/unknownForm'
import { scanStrings } from '../strings'
import { UnknownBarcodeSheet } from './UnknownBarcodeSheet'

vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

const ingredients = [{ id: 1, name: 'passata', baseUnit: 'g' as const }]
function setup(mode: UnknownMode = 'pack', extra: { canUpload?: boolean } = {}) {
  const onSave = vi.fn()
  render(<UnknownBarcodeSheet open onClose={() => {}} mode={mode} shopName="Coop" ingredients={ingredients} onSave={onSave} {...extra} />)
  return onSave
}
const picker = () => screen.getByRole('group', { name: scanStrings.pictureLabel })
async function fill() {
  await userEvent.click(screen.getByRole('combobox', { name: /Ingredient/ }))
  await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /^passata/ }))
  await userEvent.type(screen.getByRole('spinbutton', { name: 'Pack size' }), '700')
}

describe('UnknownBarcodeSheet: Picture', () => {
  it('is an upload-mode ImagePicker labelled Picture with the landscape (4:3) crop, empty at first', () => {
    setup()
    expect(picker()).toHaveAttribute('data-mode', 'upload')
    expect(picker()).toHaveAttribute('data-aspect', String(CROP_ASPECTS.landscape))
    expect(picker()).toHaveAttribute('data-value', '')
  })

  it('sits after the Product name and before Save', () => {
    setup()
    const name = screen.getByRole('textbox', { name: 'Product name' })
    expect(name.compareDocumentPosition(picker()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(picker().compareDocumentPosition(screen.getByRole('button', { name: scanStrings.save })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it.each(['weighed', 'weighed_price'] as const)('is there for a %s code too', (mode) => {
    setup(mode)
    expect(picker()).toBeInTheDocument()
  })

  it('saves the picked picture id with the form values', async () => {
    const onSave = setup()
    await fill()
    await userEvent.click(screen.getByRole('button', { name: `pick ${scanStrings.pictureLabel}` }))
    await userEvent.click(screen.getByRole('button', { name: scanStrings.save }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ image: PICKED_ID, productName: 'Passata 700 g' }))
  })

  it('saves without a picture: it is optional', async () => {
    const onSave = setup()
    await fill()
    await userEvent.click(screen.getByRole('button', { name: scanStrings.save }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]?.[0].image ?? '').toBe('')
  })

  // PPX: no longer left out offline; the offline field is a raw-mode picker (UnknownBarcodeSheet.offlinePicture.test.tsx has the details).
  it('is there while the phone is offline too, in raw mode because it cannot upload', () => {
    setup('pack', { canUpload: false })
    expect(picker()).toHaveAttribute('data-mode', 'raw')
  })
})
