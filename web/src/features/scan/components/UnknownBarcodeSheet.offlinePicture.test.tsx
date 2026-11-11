// PPX: while OFFLINE the what-is-this sheet still has the Picture field: a raw-mode ImagePicker (nothing is uploaded) with the
// storage limits, whose Blob goes to the offline queue (docs/dev/design/ppx-product-picture-sync.md).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CROP_ASPECTS } from '../../../ui/ImagePicker/lib/crop'
import { OFFLINE_PICTURE_MAX_BYTES, OFFLINE_PICTURE_MAX_SIDE } from '../lib/offlinePicture'
import { scanStrings } from '../strings'
import { UnknownBarcodeSheet } from './UnknownBarcodeSheet'
import { LOCAL_PICTURE, UPLOADED_ID } from './rawPicker.test-helper'

vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('./rawPicker.test-helper')).RawPickerFake,
}))

const ingredients = [{ id: 1, name: 'passata', baseUnit: 'g' as const }]
function setup(canUpload: boolean) {
  const onSave = vi.fn()
  const view = render(<UnknownBarcodeSheet open onClose={() => {}} mode="pack" shopName="Coop" ingredients={ingredients} onSave={onSave} canUpload={canUpload} />)
  const again = (up: boolean) =>
    view.rerender(<UnknownBarcodeSheet open onClose={() => {}} mode="pack" shopName="Coop" ingredients={ingredients} onSave={onSave} canUpload={up} />)
  return { onSave, again }
}
const picker = () => screen.getByRole('group', { name: scanStrings.pictureLabel })
const click = (name: string) => userEvent.click(screen.getByRole('button', { name }))
async function fill() {
  await userEvent.click(screen.getByRole('combobox', { name: /Ingredient/ }))
  await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /^passata/ }))
  await userEvent.type(screen.getByRole('spinbutton', { name: 'Pack size' }), '700')
}

describe('UnknownBarcodeSheet: Picture while offline', () => {
  it('shows the Picture field in raw mode, 4:3, with no link source', () => {
    setup(false)
    expect(picker()).toHaveAttribute('data-mode', 'raw')
    expect(picker()).toHaveAttribute('data-aspect', String(CROP_ASPECTS.landscape))
    expect(picker()).toHaveAttribute('data-sources', 'file,paste,camera')
    expect(picker()).toHaveAttribute('data-listen-on', 'dialog')
    expect(picker()).toHaveAttribute('data-has-value', 'no')
  })

  it('downscales before it is stored: 1600 px long edge and 2 MiB at most', () => {
    setup(false)
    expect(picker()).toHaveAttribute('data-max-side', String(OFFLINE_PICTURE_MAX_SIDE))
    expect(picker()).toHaveAttribute('data-max-bytes', String(OFFLINE_PICTURE_MAX_BYTES))
  })

  it('saves the picked Blob with the form values and no image id', async () => {
    const { onSave } = setup(false)
    await fill()
    await click(`pick local ${scanStrings.pictureLabel}`)
    expect(picker()).toHaveAttribute('data-has-value', 'yes')
    await click(scanStrings.save)
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ picture: LOCAL_PICTURE, productName: 'Passata 700 g' }))
    expect(onSave.mock.calls[0]?.[0].image ?? '').toBe('')
  })

  it('removing the picked Picture saves without one', async () => {
    const { onSave } = setup(false)
    await fill()
    await click(`pick local ${scanStrings.pictureLabel}`)
    await click(`remove local ${scanStrings.pictureLabel}`)
    await click(scanStrings.save)
    expect(onSave.mock.calls[0]?.[0].picture ?? null).toBeNull()
  })

  it('saves without a Picture: it is optional offline too', async () => {
    const { onSave } = setup(false)
    await fill()
    await click(scanStrings.save)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]?.[0].picture ?? null).toBeNull()
  })

  it('stays an upload-mode picker while online', () => {
    setup(true)
    expect(picker()).toHaveAttribute('data-mode', 'upload')
    expect(picker()).toHaveAttribute('data-sources', '')
  })

  it('a Blob picked offline is not saved once the phone is back online (the upload picker is empty again)', async () => {
    const { onSave, again } = setup(false)
    await fill()
    await click(`pick local ${scanStrings.pictureLabel}`)
    again(true)
    await click(scanStrings.save)
    expect(onSave.mock.calls[0]?.[0].picture ?? null).toBeNull()
  })

  it('a Picture already uploaded while online is kept when the phone then goes offline', async () => {
    const { onSave, again } = setup(true)
    await fill()
    await click(`pick uploaded ${scanStrings.pictureLabel}`)
    again(false)
    await click(scanStrings.save)
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ image: UPLOADED_ID }))
  })
})
