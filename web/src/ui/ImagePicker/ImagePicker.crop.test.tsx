import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ImagePicker } from './ImagePicker'
import { fakeApi, fakeDeps, fakeEngine, ID_A, ID_B, pngFile, stored } from './testing'
import type { ImagePickerProps, RawImage } from './types'

const user = userEvent.setup({ applyAccept: false })

type UploadExtras = Partial<Pick<ImagePickerProps, 'aspect' | 'crop'>>

/** A host that keeps the id in state, like a form does. */
function Host({ initial = ID_A, deps, onValue, ...extra }: { initial?: string; deps: ReturnType<typeof fakeDeps>; onValue?: (v: string) => void } & UploadExtras) {
  const [value, setValue] = useState(initial)
  return (
    <ImagePicker
      label="Recipe photo"
      value={value}
      onChange={(v) => {
        setValue(v)
        onValue?.(v)
      }}
      deps={deps}
      {...extra}
    />
  )
}

const cropButton = () => screen.getByRole('button', { name: 'Crop' })
const editor = () => screen.findByRole('group', { name: 'Crop image' })
const status = () => screen.getByRole('status')
const fileInput = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[type=file]:not([capture])')!

async function openEditor() {
  await user.click(cropButton())
  return editor()
}

describe('ImagePicker, the Crop button', () => {
  it('is offered with a picture, next to Rotate and Remove', () => {
    render(<Host deps={fakeDeps()} />)
    expect(cropButton()).toBeEnabled()
    for (const name of ['Rotate left', 'Rotate right', 'Remove image']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
  })

  it('is not offered without a picture, with crop={false}, or for a pasted link in raw mode (the picker never holds its pixels)', () => {
    const { unmount } = render(<Host initial="" deps={fakeDeps()} />)
    expect(screen.queryByRole('button', { name: 'Crop' })).not.toBeInTheDocument()
    unmount()
    const off = render(<Host deps={fakeDeps()} crop={false} />)
    expect(screen.queryByRole('button', { name: 'Crop' })).not.toBeInTheDocument()
    off.unmount()
    render(<ImagePicker mode="raw" label="Photo" value={{ kind: 'url', url: 'https://x.example/a.png' }} onChange={() => {}} deps={fakeDeps()} />)
    expect(screen.queryByRole('button', { name: 'Crop' })).not.toBeInTheDocument()
  })

  it('is locked while a pick is in flight', async () => {
    const api = fakeApi({ uploadDataUrl: vi.fn(() => new Promise<ReturnType<typeof stored>>(() => {})) })
    const { container } = render(<Host deps={fakeDeps({ api })} />)
    await user.upload(fileInput(container), pngFile())
    await screen.findByRole('status')
    expect(cropButton()).toBeDisabled()
  })
})

describe('ImagePicker, crop editor (upload mode)', () => {
  it('loads the stored picture, shows the editor in place of the preview and puts the focus in it', async () => {
    const deps = fakeDeps()
    render(<Host deps={deps} />)
    await openEditor()
    expect(deps.api.loadBlob).toHaveBeenCalledWith(`/api/images/${ID_A}`)
    expect(screen.queryByRole('button', { name: 'Remove image' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move crop area' })).toHaveFocus()
  })

  it('says it is loading while the picture is fetched', async () => {
    const api = fakeApi({ loadBlob: vi.fn(() => new Promise<Blob>(() => {})) })
    render(<Host deps={fakeDeps({ api })} />)
    await user.click(cropButton())
    expect(await screen.findByRole('status')).toHaveTextContent(/Loading the image/)
  })

  it('a picture that cannot be loaded is an error, and the picker stays as it was', async () => {
    const api = fakeApi({ loadBlob: vi.fn(async () => Promise.reject(new Error('404'))) })
    render(<Host deps={fakeDeps({ api })} />)
    await user.click(cropButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be opened/)
    expect(screen.queryByRole('group', { name: 'Crop image' })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Recipe photo' })).toBeInTheDocument()
  })

  it.each([
    ['the default is 4:3', undefined, { width: 1000, height: 1000 }, 'Crop area: 1000 by 750 pixels'],
    ['a Member avatar is 1:1', 1, { width: 800, height: 600 }, 'Crop area: 600 by 600 pixels'],
    ['"free" starts with the whole picture', 'free', { width: 800, height: 600 }, 'Crop area: 800 by 600 pixels'],
  ] as const)('the aspect prop: %s', async (_n, aspect, size, text) => {
    render(<Host deps={fakeDeps({ engine: fakeEngine({ ...size }) })} aspect={aspect} />)
    await openEditor()
    expect(status()).toHaveTextContent(text)
  })

  it('Use crop uploads the cropped picture as a NEW image and swaps the id; the host\'s own image is not deleted', async () => {
    const deps = fakeDeps({ api: fakeApi({ uploadDataUrl: vi.fn(async () => stored(ID_B)) }) })
    const onValue = vi.fn()
    render(<Host deps={deps} onValue={onValue} aspect="free" />)
    await openEditor()
    screen.getByRole('button', { name: 'Resize crop, bottom right corner' }).focus()
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}')
    await user.click(screen.getByRole('button', { name: 'Use crop' }))
    await waitFor(() => expect(onValue).toHaveBeenCalledWith(ID_B))
    expect(deps.engine.encode.mock.calls[0]![1]).toMatchObject({ turns: 0, crop: { x: 0, y: 0, width: 720, height: 600 }, width: 720, height: 600 })
    expect(deps.api.uploadDataUrl).toHaveBeenCalledTimes(1)
    expect(deps.api.discard).not.toHaveBeenCalled() // ID_A belongs to the saved entity
    expect(screen.queryByRole('group', { name: 'Crop image' })).not.toBeInTheDocument()
    expect(cropButton()).toHaveFocus()
  })

  it('a rotation made inside the editor is applied together with the crop', async () => {
    const deps = fakeDeps()
    render(<Host deps={deps} aspect="free" />)
    await openEditor()
    const ed = within(screen.getByRole('group', { name: 'Crop image' }))
    await user.click(ed.getByRole('button', { name: 'Rotate right' }))
    await user.click(ed.getByRole('button', { name: 'Use crop' }))
    await waitFor(() => expect(deps.engine.encode).toHaveBeenCalled())
    expect(deps.engine.encode.mock.calls[0]![1]).toMatchObject({ turns: 1, crop: { x: 0, y: 0, width: 600, height: 800 }, width: 600, height: 800 })
  })

  it('cropping a picture this picker uploaded discards the earlier upload (no orphan)', async () => {
    const api = fakeApi({ uploadDataUrl: vi.fn().mockResolvedValueOnce(stored(ID_A)).mockResolvedValueOnce(stored(ID_B)) })
    const deps = fakeDeps({ api })
    const { container } = render(<Host initial="" deps={deps} aspect="free" />)
    await user.upload(fileInput(container), pngFile())
    await screen.findByRole('img', { name: 'Recipe photo' })
    await openEditor()
    screen.getByRole('button', { name: 'Resize crop, bottom right corner' }).focus()
    await user.keyboard('{ArrowLeft}')
    await user.click(screen.getByRole('button', { name: 'Use crop' }))
    await waitFor(() => expect(api.discard).toHaveBeenCalledWith(ID_A))
    expect(api.discard).not.toHaveBeenCalledWith(ID_B)
  })

  it('Use crop with nothing changed closes the editor and sends nothing', async () => {
    const deps = fakeDeps()
    const onValue = vi.fn()
    render(<Host deps={deps} onValue={onValue} aspect="free" />)
    await openEditor()
    await user.click(screen.getByRole('button', { name: 'Use crop' }))
    expect(screen.queryByRole('group', { name: 'Crop image' })).not.toBeInTheDocument()
    expect(deps.api.uploadDataUrl).not.toHaveBeenCalled()
    expect(onValue).not.toHaveBeenCalled()
  })

  it('Cancel and Escape close the editor, change nothing and give the focus back to Crop', async () => {
    const deps = fakeDeps()
    const onValue = vi.fn()
    render(<Host deps={deps} onValue={onValue} />)
    await openEditor()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Crop image' })).not.toBeInTheDocument()
    expect(cropButton()).toHaveFocus()
    await openEditor()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Crop image' })).not.toBeInTheDocument()
    expect(cropButton()).toHaveFocus()
    expect(deps.api.uploadDataUrl).not.toHaveBeenCalled()
    expect(onValue).not.toHaveBeenCalled()
  })

  it('is busy while the cropped picture is uploading', async () => {
    const api = fakeApi({ uploadDataUrl: vi.fn(() => new Promise<ReturnType<typeof stored>>(() => {})) })
    render(<Host deps={fakeDeps({ api })} aspect="free" />)
    await openEditor()
    await user.click(screen.getByRole('button', { name: 'Rotate right' }))
    await user.click(screen.getByRole('button', { name: 'Use crop' }))
    await waitFor(() => expect(screen.getByRole('group', { name: 'Crop image' })).toHaveAttribute('aria-busy', 'true'))
    expect(screen.getByRole('button', { name: 'Use crop' })).toBeDisabled()
  })

  it('a failed upload shows the error, keeps the editor open for another try and keeps the previous picture', async () => {
    const api = fakeApi({ uploadDataUrl: vi.fn(async () => Promise.reject(new Error('offline'))) })
    const onValue = vi.fn()
    render(<Host deps={fakeDeps({ api })} onValue={onValue} aspect="free" />)
    await openEditor()
    await user.click(screen.getByRole('button', { name: 'Rotate left' }))
    await user.click(screen.getByRole('button', { name: 'Use crop' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Crop image' })).toBeInTheDocument()
    expect(onValue).not.toHaveBeenCalled()
  })
})

describe('ImagePicker, crop editor (raw mode: Recipe Assistant "Read from a photo")', () => {
  const held: RawImage = { kind: 'blob', blob: new Blob([new Uint8Array(10)], { type: 'image/jpeg' }), width: 4000, height: 3000, type: 'image/jpeg', origin: 'file' }

  it('crops the held Blob in place: nothing is fetched or uploaded, the result is downscaled to maxSide and the old preview URL is released', async () => {
    const deps = fakeDeps({ engine: fakeEngine({ width: 4000, height: 3000 }) })
    const onChange = vi.fn()
    render(<ImagePicker mode="raw" label="Photo of the recipe" value={held} onChange={onChange} deps={deps} />)
    await openEditor()
    expect(deps.api.loadBlob).not.toHaveBeenCalled()
    expect(status()).toHaveTextContent('Crop area: 4000 by 3000 pixels') // raw mode is "free" by default
    screen.getByRole('button', { name: 'Resize crop, bottom right corner' }).focus()
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}') // 1% of 4000 = 40, Shift x10
    expect(status()).toHaveTextContent('Crop area: 3600 by 3000 pixels')
    await user.click(screen.getByRole('button', { name: 'Use crop' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(onChange.mock.calls[0]![0]).toMatchObject({ kind: 'blob', width: 2576, height: 2147, origin: 'file' })
    expect(deps.api.uploadDataUrl).not.toHaveBeenCalled()
    expect(deps.engine.encode.mock.calls[0]![1]).toMatchObject({ crop: { x: 0, y: 0, width: 3600, height: 3000 }, width: 2576, height: 2147 })
  })

  it('output "dataUrl" gives the data URL of the cropped picture too', async () => {
    const deps = fakeDeps({ engine: fakeEngine({ width: 4000, height: 3000 }) })
    const onChange = vi.fn()
    render(<ImagePicker mode="raw" label="Photo of the recipe" value={held} onChange={onChange} output="dataUrl" deps={deps} />)
    await openEditor()
    await user.click(screen.getByRole('button', { name: 'Rotate right' }))
    await user.click(screen.getByRole('button', { name: 'Use crop' }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.calls[0]![0].dataUrl).toMatch(/^data:image\/jpeg;base64,/)
  })
})
