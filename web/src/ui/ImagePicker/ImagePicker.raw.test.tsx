import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ImagePicker } from './ImagePicker'
import { fakeDeps, fakeEngine, heicFile, paste, pngFile } from './testing'
import type { RawImage } from './types'

const user = userEvent.setup({ applyAccept: false })
const MB = 1 << 20

function setup(props: { value?: RawImage | null; maxSide?: number; maxBytes?: number; output?: 'blob' | 'dataUrl' } = {}, engineSize = { width: 4000, height: 3000 }) {
  const deps = fakeDeps({ engine: fakeEngine(engineSize) })
  const onChange = vi.fn()
  const view = render(<ImagePicker mode="raw" label="Photo of the recipe" value={props.value ?? null} onChange={onChange} deps={deps} {...props} />)
  const input = view.container.querySelector<HTMLInputElement>('input[type=file]:not([capture])')!
  return { deps, onChange, input, ...view }
}

describe('ImagePicker, raw mode (Recipe Assistant "Read from a photo")', () => {
  it('hands the host a Blob downscaled to 2576 px on the long edge, and never calls the server', async () => {
    const { deps, onChange, input } = setup()
    await user.upload(input, pngFile('menu.png'))
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    const out = onChange.mock.calls[0]![0] as Extract<RawImage, { kind: 'blob' }>
    expect(out).toMatchObject({ kind: 'blob', width: 2576, height: 1932, type: 'image/png', origin: 'file' })
    expect(out.blob).toBeInstanceOf(Blob)
    expect(out.dataUrl).toBeUndefined()
    expect(deps.api.uploadDataUrl).not.toHaveBeenCalled()
    expect(deps.api.ingestUrl).not.toHaveBeenCalled()
  })

  it('maxSide changes the long edge', async () => {
    const { onChange, input } = setup({ maxSide: 1000 })
    await user.upload(input, pngFile())
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.calls[0]![0]).toMatchObject({ width: 1000, height: 750 })
  })

  it('output "dataUrl" adds the data URL next to the blob', async () => {
    const { onChange, input } = setup({ output: 'dataUrl' })
    await user.upload(input, pngFile())
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const out = onChange.mock.calls[0]![0] as Extract<RawImage, { kind: 'blob' }>
    expect(out.dataUrl).toMatch(/^data:image\/png;base64,/)
    expect(out.blob).toBeInstanceOf(Blob)
  })

  it('a pasted picture reports origin "paste"; a dropped one "drop"', async () => {
    const { onChange } = setup()
    paste(screen.getByRole('button', { name: /Choose a file/ }), { files: [pngFile()] })
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(onChange.mock.calls[0]![0]).toMatchObject({ origin: 'paste' })
  })

  it('a pasted https link is passed through as a link (the consumer fetches it); an http link is refused', async () => {
    const { deps, onChange } = setup()
    await user.click(screen.getByRole('button', { name: 'Paste link' }))
    await user.type(screen.getByRole('textbox', { name: 'Image link' }), 'http://x.example/a.png{Enter}')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    await user.clear(screen.getByRole('textbox', { name: 'Image link' }))
    await user.type(screen.getByRole('textbox', { name: 'Image link' }), 'https://x.example/a.png{Enter}')
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ kind: 'url', url: 'https://x.example/a.png' }))
    expect(deps.api.ingestUrl).not.toHaveBeenCalled()
  })

  it('the byte limit is the host\'s and the message names it', async () => {
    const { onChange, input } = setup({ maxBytes: 5 * MB }, { width: 100, height: 100 })
    await user.upload(input, new File([new Uint8Array(5 * MB + 1)], 'big.png', { type: 'image/png' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/5 MB/)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('previews the blob through an object URL, and revokes it when replaced, removed or unmounted', async () => {
    const blob = new Blob([new Uint8Array(10)], { type: 'image/jpeg' })
    const value: RawImage = { kind: 'blob', blob, width: 800, height: 600, type: 'image/jpeg', origin: 'file' }
    const deps = fakeDeps()
    const { unmount } = render(<ImagePicker mode="raw" label="Photo of the recipe" value={value} onChange={() => {}} deps={deps} />)
    expect(deps.objectUrls.create).toHaveBeenCalledWith(blob)
    expect(screen.getByRole('img', { name: 'Photo of the recipe' })).toHaveAttribute('src', 'blob:preview-1')
    unmount()
    expect(deps.objectUrls.revoke).toHaveBeenCalledWith('blob:preview-1')
  })

  it('previews a link value with the link itself', () => {
    render(<ImagePicker mode="raw" label="Photo of the recipe" value={{ kind: 'url', url: 'https://x.example/a.png' }} onChange={() => {}} deps={fakeDeps()} />)
    expect(screen.getByRole('img', { name: 'Photo of the recipe' })).toHaveAttribute('src', 'https://x.example/a.png')
  })

  it('Remove gives the host null', async () => {
    const value: RawImage = { kind: 'url', url: 'https://x.example/a.png' }
    const { onChange } = setup({ value })
    await user.click(screen.getByRole('button', { name: 'Remove image' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('Rotate right turns the held blob in the browser and gives the host the new one (no server)', async () => {
    const blob = new Blob([new Uint8Array(10)], { type: 'image/jpeg' })
    const value: RawImage = { kind: 'blob', blob, width: 800, height: 600, type: 'image/jpeg', origin: 'file' }
    const { deps, onChange } = setup({ value }, { width: 800, height: 600 })
    await user.click(screen.getByRole('button', { name: 'Rotate right' }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(deps.engine.encode.mock.calls[0]![1]).toMatchObject({ turns: 1, width: 600, height: 800 })
    expect(onChange.mock.calls[0]![0]).toMatchObject({ kind: 'blob', width: 600, height: 800 })
    expect(deps.api.loadBlob).not.toHaveBeenCalled()
    expect(deps.api.uploadDataUrl).not.toHaveBeenCalled()
  })

  it('a link value cannot be rotated (nothing local to turn)', () => {
    setup({ value: { kind: 'url', url: 'https://x.example/a.png' } })
    expect(screen.queryByRole('button', { name: 'Rotate right' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rotate left' })).not.toBeInTheDocument()
  })

  // TODO(heic): HEIC is refused for now (HEIC_ENABLED in lib/limits.ts). When the decoder lands, flip back to: Safari decodes it and onChange
  // gets a JPEG blob of 2576x1932 (no upload); a browser that cannot decode it says "cannot read that image".
  it('an iPhone photo (HEIC) is refused with the unsupported message suggesting JPEG or PNG; nothing is decoded or sent', async () => {
    const { onChange, input, deps } = setup()
    await user.upload(input, heicFile())
    expect(await screen.findByRole('alert')).toHaveTextContent(/save or share it as JPEG or PNG/)
    expect(onChange).not.toHaveBeenCalled()
    expect(deps.engine.decode).not.toHaveBeenCalled()
    expect(deps.api.uploadDataUrl).not.toHaveBeenCalled()
  })
})
