// SR5 (13.5 step 4, 2.3): an optional Picture from the phone's own camera: our Button behind a hidden capture input, a preview, Retake.
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { addButton, CAPTURED, choose, dialog, fakePictures, fileInput, packGroup, photo, setup, UPLOADED_ID } from './newProduct.test-helper'

async function ready(over: Parameters<typeof setup>[0] = {}) {
  const view = setup(over)
  await choose(/Ingredient/, /^milk/)
  await userEvent.click(within(packGroup()).getByRole('button', { name: '1 l' }))
  return view
}
const shot = (c: HTMLElement) => userEvent.upload(fileInput(c), photo())

describe('NewProductSheet: Picture', () => {
  it('is a hidden image input with capture=environment behind our own secondary Button "Take a Picture"', async () => {
    const { container } = await ready()
    const input = fileInput(container)
    expect(input).toHaveAttribute('accept', 'image/*')
    expect(input).toHaveAttribute('capture', 'environment')
    expect(input.hidden).toBe(true)
    const button = within(dialog()).getByRole('button', { name: 'Take a Picture' })
    expect(button).toHaveAttribute('data-variant', 'secondary')
    expect(button.tagName).toBe('BUTTON')
  })

  it('says it is optional', async () => {
    await ready()
    expect(within(dialog()).getByText('Optional: you can add it later on the Product page.')).toBeInTheDocument()
  })

  it('the Button opens the camera app by clicking the input', async () => {
    const { container } = await ready()
    const click = vi.spyOn(fileInput(container), 'click')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Take a Picture' }))
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('on a computer (no coarse pointer) it reads "Choose a Picture"', async () => {
    await ready({ coarsePointer: false })
    expect(within(dialog()).getByRole('button', { name: 'Choose a Picture' })).toBeInTheDocument()
    expect(within(dialog()).queryByRole('button', { name: 'Take a Picture' })).toBeNull()
  })

  it('tells the caller to stop the scanner before the camera opens and to restart it when the Picture or a cancel is back', async () => {
    const onPicturePicking = vi.fn()
    const { container } = await ready({ onPicturePicking })
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Take a Picture' }))
    expect(onPicturePicking).toHaveBeenLastCalledWith(true)
    await shot(container)
    await waitFor(() => expect(onPicturePicking).toHaveBeenLastCalledWith(false))
  })

  it('a cancelled camera also ends the picking', async () => {
    const onPicturePicking = vi.fn()
    const { container } = await ready({ onPicturePicking })
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Take a Picture' }))
    fireEvent(fileInput(container), new Event('cancel'))
    expect(onPicturePicking).toHaveBeenLastCalledWith(false)
    expect(within(dialog()).getByRole('button', { name: 'Take a Picture' })).toBeInTheDocument()
  })

  it('prepares the captured file (4:3, downscaled), then shows a preview with Retake in place of the Button', async () => {
    const pictures = fakePictures()
    const { container } = await ready({ pictures })
    await shot(container)
    expect(await within(dialog()).findByRole('img', { name: 'The Picture of the new Product' })).toBeInTheDocument()
    expect(pictures.prepare).toHaveBeenCalledTimes(1)
    expect(pictures.prepare.mock.calls[0]?.[0]).toBeInstanceOf(File)
    expect(within(dialog()).getByText('Cropped to 4:3 automatically')).toBeInTheDocument()
    expect(within(dialog()).getByRole('button', { name: 'Retake' })).toBeInTheDocument()
    expect(within(dialog()).queryByRole('button', { name: 'Take a Picture' })).toBeNull()
  })

  it('Retake opens the camera again and the new Picture replaces the old one', async () => {
    const second = { ...CAPTURED, width: 800 }
    const pictures = fakePictures({ prepare: vi.fn().mockResolvedValueOnce(CAPTURED).mockResolvedValueOnce(second) })
    const { container, props } = await ready({ pictures })
    await shot(container)
    await within(dialog()).findByRole('button', { name: 'Retake' })
    const click = vi.spyOn(fileInput(container), 'click')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Retake' }))
    expect(click).toHaveBeenCalledTimes(1)
    await shot(container)
    await waitFor(() => expect(pictures.prepare).toHaveBeenCalledTimes(2))
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
    expect(props.onSave.mock.calls[0]?.[0].image).toBe(UPLOADED_ID)
    expect(pictures.upload).toHaveBeenLastCalledWith(second)
  })

  it('online: uploads at once and the Op gets the image id', async () => {
    const pictures = fakePictures()
    const { container, props } = await ready({ pictures, canUpload: true })
    await shot(container)
    await waitFor(() => expect(pictures.upload).toHaveBeenCalledWith(CAPTURED))
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
    expect(props.onSave.mock.calls[0]?.[0]).toMatchObject({ image: UPLOADED_ID })
  })

  it('offline: nothing is uploaded and the form carries the Blob for the queue', async () => {
    const pictures = fakePictures()
    const { container, props } = await ready({ pictures, canUpload: false })
    await shot(container)
    await within(dialog()).findByRole('button', { name: 'Retake' })
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
    expect(pictures.upload).not.toHaveBeenCalled()
    expect(props.onSave.mock.calls[0]?.[0].picture).toBe(CAPTURED)
    expect(props.onSave.mock.calls[0]?.[0].image ?? '').toBe('')
  })

  it('Add waits for a running upload', async () => {
    let finish: (id: string) => void = () => {}
    const pictures = fakePictures({ upload: vi.fn(() => new Promise<string>((r) => (finish = r))) })
    const { container, props } = await ready({ pictures })
    await shot(container)
    await waitFor(() => expect(pictures.upload).toHaveBeenCalled())
    expect(addButton()).toBeDisabled()
    finish(UPLOADED_ID)
    await waitFor(() => expect(addButton()).toBeEnabled())
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
  })

  it('a file that cannot be used says so, keeps the Button and does not block Add', async () => {
    const pictures = fakePictures({ prepare: vi.fn().mockRejectedValue(new Error('not an image')) })
    const { container, props } = await ready({ pictures })
    await shot(container)
    expect(await within(dialog()).findByText('That Picture could not be used. Try another.')).toBeInTheDocument()
    expect(within(dialog()).getByRole('button', { name: 'Take a Picture' })).toBeInTheDocument()
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
    expect(props.onSave.mock.calls[0]?.[0].image ?? '').toBe('')
  })

  it('a failed upload keeps the Picture out of the Op and says so', async () => {
    const pictures = fakePictures({ upload: vi.fn().mockRejectedValue(new Error('offline')) })
    const { container, props } = await ready({ pictures })
    await shot(container)
    expect(await within(dialog()).findByText('That Picture could not be used. Try another.')).toBeInTheDocument()
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
    expect(props.onSave.mock.calls[0]?.[0].image ?? '').toBe('')
  })

  it('adds without a Picture: it is optional', async () => {
    const { props } = await ready()
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
    expect(props.onSave.mock.calls[0]?.[0].image ?? '').toBe('')
    expect(props.onSave.mock.calls[0]?.[0].picture ?? null).toBeNull()
  })

  it('a weighed code has no Picture step', async () => {
    setup({ mode: 'weighed' })
    await choose(/Ingredient/, /^milk/)
    expect(within(dialog()).queryByRole('button', { name: /Picture/ })).toBeNull()
    expect(screen.queryByText('Optional: you can add it later on the Product page.')).toBeNull()
  })
})
