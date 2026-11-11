// PE: onBusyChange tells a host when the picker is working (preparing, uploading, converting, downloading), so it can disable Save meanwhile.
import { render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ImagePicker } from './ImagePicker'
import { fakeApi, fakeDeps, ID_A, pngFile, stored } from './testing'

const user = userEvent.setup({ applyAccept: false })

function gate() {
  let resolve!: (v: ReturnType<typeof stored>) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<ReturnType<typeof stored>>((res, rej) => ((resolve = res), (reject = rej)))
  return { promise, resolve, reject }
}

function setup(upload: ReturnType<typeof gate>) {
  const deps = fakeDeps({ api: fakeApi({ uploadDataUrl: vi.fn(() => upload.promise) }) })
  const onBusyChange = vi.fn()
  const view = render(<ImagePicker label="Picture" value="" onChange={vi.fn()} deps={deps} onBusyChange={onBusyChange} />)
  const input = view.container.querySelector<HTMLInputElement>('input[type=file]:not([capture])')!
  return { onBusyChange, input, ...view }
}

describe('ImagePicker: onBusyChange', () => {
  it('is not called with true while idle', () => {
    const { onBusyChange } = setup(gate())
    expect(onBusyChange).not.toHaveBeenCalledWith(true)
  })

  it('reports true while a picture uploads and false once it is stored', async () => {
    const upload = gate()
    const { onBusyChange, input } = setup(upload)
    await user.upload(input, pngFile())
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(true))
    upload.resolve(stored(ID_A))
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false))
    expect(onBusyChange.mock.calls.map((c) => c[0])).toEqual([true, false])
  })

  it('reports false again when the upload fails', async () => {
    const upload = gate()
    const { onBusyChange, input } = setup(upload)
    await user.upload(input, pngFile())
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(true))
    upload.reject(new Error('boom'))
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false))
  })

  it('reports false when the picker unmounts while busy, so a host never stays locked', async () => {
    const upload = gate()
    const { onBusyChange, input, unmount } = setup(upload)
    await user.upload(input, pngFile())
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(true))
    unmount()
    expect(onBusyChange).toHaveBeenLastCalledWith(false)
  })
})
