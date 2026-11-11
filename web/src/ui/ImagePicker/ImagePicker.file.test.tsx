import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/http'
import { ImagePicker } from './ImagePicker'
import { drop, fakeApi, fakeDeps, gifFile, heicFile, hugeFile, pdfFile, ID_A, ID_B, pngFile, stored } from './testing'

const user = userEvent.setup({ applyAccept: false })

function setup(extra: { value?: string; api?: ReturnType<typeof fakeApi> } = {}) {
  const deps = fakeDeps(extra.api ? { api: extra.api } : {})
  const onChange = vi.fn()
  const view = render(<ImagePicker label="Recipe photo" value={extra.value ?? ''} onChange={onChange} deps={deps} />)
  const input = view.container.querySelector<HTMLInputElement>('input[type=file]:not([capture])')!
  return { deps, onChange, input, ...view }
}

describe('ImagePicker, from a file', () => {
  it('browse: the chosen picture is uploaded and the host gets the image id', async () => {
    const { deps, onChange, input } = setup()
    await user.upload(input, pngFile())
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(ID_A))
    expect(deps.api.uploadDataUrl).toHaveBeenCalledTimes(1)
    expect((deps.api.uploadDataUrl.mock.calls[0] as unknown as [string])[0]).toMatch(/^data:image\/png;base64,/)
  })

  it('drag and drop: a dropped picture is uploaded too', async () => {
    const { deps, onChange } = setup()
    drop(screen.getByTestId('file-drop-zone'), [pngFile()])
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(ID_A))
    expect(deps.api.uploadDataUrl).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a GIF', gifFile],
    ['a PDF', pdfFile],
  ])('%s is refused with the formats message, and nothing is sent', async (_n, make) => {
    const { deps, onChange } = setup()
    drop(screen.getByTestId('file-drop-zone'), [make()])
    expect(await screen.findByRole('alert')).toHaveTextContent(/JPEG, PNG or WebP/)
    expect(deps.api.uploadDataUrl).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  // TODO(heic): HEIC is refused for now (HEIC_ENABLED in lib/limits.ts). When the decoder lands, flip these back: a HEIC/HEIF is sent
  // untouched as data:image/heic (or heif), a HEIC with no type is recognised by its name, and a HEIC over 8 MB shows the size message.
  it.each([
    ['an iPhone photo (HEIC)', () => heicFile()],
    ['a HEIC the browser gives no type for', () => new File([new Uint8Array(16)], 'IMG_0002.HEIC', { type: '' })],
    ['a HEIF file', () => new File([new Uint8Array(16)], 'a.heif', { type: 'image/heif' })],
    ['a HEIC over 8 MB', () => new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'big.heic', { type: 'image/heic' })],
  ])('%s is refused with the unsupported message suggesting JPEG or PNG, and nothing is sent', async (_n, make) => {
    const { deps, onChange } = setup()
    drop(screen.getByTestId('file-drop-zone'), [make()])
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/JPEG, PNG or WebP/)
    expect(alert).toHaveTextContent(/save or share it as JPEG or PNG/)
    expect(deps.api.uploadDataUrl).not.toHaveBeenCalled()
    expect(deps.engine.decode).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('a picture over 8 MB shows the size limit message and is not sent', async () => {
    const { deps, onChange, input } = setup()
    await user.upload(input, hugeFile())
    expect(await screen.findByRole('alert')).toHaveTextContent(/8 MB/)
    expect(deps.api.uploadDataUrl).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('while uploading it says so, locks the actions and offers Cancel', async () => {
    let signal: AbortSignal | undefined
    const api = fakeApi({
      uploadDataUrl: vi.fn((_u: string, o?: { signal?: AbortSignal }) => {
        signal = o?.signal
        return new Promise<ReturnType<typeof stored>>(() => {})
      }),
    })
    const { input, onChange } = setup({ api })
    await user.upload(input, pngFile())
    expect(await screen.findByRole('status')).toHaveTextContent(/Uploading the image/)
    expect(screen.getByRole('group', { name: 'Recipe photo' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Paste image' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Choose a file/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(signal?.aborted).toBe(true)
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('a server failure is shown, the old value is kept, and the next success clears it', async () => {
    const api = fakeApi({ uploadDataUrl: vi.fn().mockRejectedValueOnce(new ApiError(500, 'internal', 'x')).mockResolvedValue(stored(ID_B)) })
    const { input, onChange } = setup({ api, value: ID_A })
    await user.upload(input, pngFile())
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('img', { name: 'Recipe photo' })).toHaveAttribute('src', `/api/images/${ID_A}`)
    await user.upload(input, pngFile())
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(ID_B))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('the server size and type refusals reach the user in plain words', async () => {
    const api = fakeApi({ uploadDataUrl: vi.fn().mockRejectedValue(new ApiError(413, 'image_too_large', 'x')) })
    const { input } = setup({ api })
    await user.upload(input, pngFile())
    expect(await screen.findByRole('alert')).toHaveTextContent(/8 MB/)
  })

  it('a picture the browser cannot decode is reported, not uploaded', async () => {
    const { deps, input } = setup()
    deps.engine.decode.mockRejectedValue(new Error('heic'))
    await user.upload(input, pngFile())
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(deps.api.uploadDataUrl).not.toHaveBeenCalled()
  })
})
