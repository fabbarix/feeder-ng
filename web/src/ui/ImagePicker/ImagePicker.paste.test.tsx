import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ImagePicker } from './ImagePicker'
import { fakeApi, fakeClipboard, fakeDeps, ID_A, ID_B, paste, pngFile, stored } from './testing'

const user = userEvent.setup({ applyAccept: false })
const noop = () => {}

function setup(over: Parameters<typeof fakeDeps>[0] = {}, props: { disabled?: boolean } = {}) {
  const deps = fakeDeps(over)
  const onChange = vi.fn()
  const view = render(<ImagePicker label="Recipe photo" value="" onChange={onChange} deps={deps} {...props} />)
  return { deps, onChange, ...view }
}
const drop = () => screen.getByRole('button', { name: /Choose a file/ })

describe('ImagePicker, paste event (Ctrl+V while the picker has focus)', () => {
  it('a pasted picture is uploaded', async () => {
    const { deps, onChange } = setup()
    const event = paste(drop(), { files: [pngFile()] })
    expect(event.defaultPrevented).toBe(true)
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(ID_A))
    expect(deps.api.uploadDataUrl).toHaveBeenCalledTimes(1)
  })

  it('works from any control inside the picker, and on the group itself', async () => {
    const { deps } = setup()
    paste(screen.getByRole('button', { name: 'Paste link' }), { files: [pngFile()] })
    await waitFor(() => expect(deps.api.uploadDataUrl).toHaveBeenCalledTimes(1))
    paste(screen.getByRole('group', { name: 'Recipe photo' }), { files: [pngFile()] })
    await waitFor(() => expect(deps.api.uploadDataUrl).toHaveBeenCalledTimes(2))
  })

  it('a pasted https link is sent to the server to download', async () => {
    const { deps, onChange } = setup()
    paste(drop(), { text: 'https://photos.example/soup.png' })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(ID_B))
    expect((deps.api.ingestUrl.mock.calls[0] as unknown as [string])[0]).toBe('https://photos.example/soup.png')
    expect(deps.api.uploadDataUrl).not.toHaveBeenCalled()
  })

  it('words on the clipboard are an error, not an upload', async () => {
    const { deps, onChange } = setup()
    const event = paste(drop(), { text: 'buy milk' })
    expect(await screen.findByRole('alert')).toHaveTextContent(/clipboard/i)
    expect(event.defaultPrevented).toBe(true)
    expect(deps.api.uploadDataUrl).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores a paste while disabled or busy', async () => {
    const off = setup({}, { disabled: true })
    const event = paste(screen.getByRole('group', { name: 'Recipe photo' }), { files: [pngFile()] })
    expect(event.defaultPrevented).toBe(false)
    expect(off.deps.api.uploadDataUrl).not.toHaveBeenCalled()
    off.unmount()

    const api = fakeApi({ uploadDataUrl: vi.fn(() => new Promise<ReturnType<typeof stored>>(() => {})) })
    const busy = setup({ api })
    paste(drop(), { files: [pngFile()] })
    await screen.findByRole('status')
    paste(screen.getByRole('button', { name: 'Cancel' }), { files: [pngFile()] })
    expect(busy.deps.api.uploadDataUrl).toHaveBeenCalledTimes(1)
  })
})

describe('ImagePicker, the Paste image button (Clipboard API)', () => {
  it('reads the clipboard and uploads the picture', async () => {
    const clipboard = fakeClipboard({ image: new Blob([new Uint8Array(20)], { type: 'image/png' }) })
    const { deps, onChange } = setup({ clipboard })
    await user.click(screen.getByRole('button', { name: 'Paste image' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(ID_A))
    expect(clipboard.read).toHaveBeenCalled()
    expect(deps.api.uploadDataUrl).toHaveBeenCalledTimes(1)
  })

  it('a link on the clipboard goes to the server', async () => {
    const { deps, onChange } = setup({ clipboard: fakeClipboard({ text: 'https://photos.example/a.png' }) })
    await user.click(screen.getByRole('button', { name: 'Paste image' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(ID_B))
    expect(deps.api.ingestUrl).toHaveBeenCalledTimes(1)
  })

  it('an empty clipboard says so', async () => {
    setup({ clipboard: fakeClipboard() })
    await user.click(screen.getByRole('button', { name: 'Paste image' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/clipboard/i)
  })

  it('when the browser refuses or has no Clipboard API, it explains the keyboard route (Ctrl+V)', async () => {
    const denied = setup({ clipboard: fakeClipboard({ denied: true }) })
    await user.click(screen.getByRole('button', { name: 'Paste image' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Ctrl\+V/)
    denied.unmount()
    setup({ clipboard: null })
    await user.click(screen.getByRole('button', { name: 'Paste image' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Ctrl\+V/)
  })

  it('is reachable and usable from the keyboard', async () => {
    const clipboard = fakeClipboard({ image: new Blob([new Uint8Array(20)], { type: 'image/png' }) })
    const { onChange } = setup({ clipboard })
    screen.getByRole('button', { name: 'Paste image' }).focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(ID_A))
  })
})

describe('ImagePicker, paste inside a sheet (listenOn="dialog")', () => {
  function inSheet(listenOn?: 'dialog') {
    const deps = fakeDeps()
    const view = render(
      <dialog open>
        <h2 tabIndex={-1}>Edit Recipe</h2>
        <ImagePicker label="Recipe photo" value="" onChange={noop} listenOn={listenOn} deps={deps} />
      </dialog>,
    )
    return { deps, ...view }
  }

  it('a paste anywhere in the dialog reaches the picker', async () => {
    const { deps } = inSheet('dialog')
    paste(screen.getByRole('heading', { name: 'Edit Recipe' }), { files: [pngFile()] })
    await waitFor(() => expect(deps.api.uploadDataUrl).toHaveBeenCalledTimes(1))
  })

  it('by default only a paste inside the picker counts', () => {
    const { deps } = inSheet()
    paste(screen.getByRole('heading', { name: 'Edit Recipe' }), { files: [pngFile()] })
    expect(deps.api.uploadDataUrl).not.toHaveBeenCalled()
  })

  it('stops listening when the picker unmounts', () => {
    const { deps, unmount, container } = inSheet('dialog')
    const dialog = container.querySelector('dialog')!
    unmount()
    paste(dialog, { files: [pngFile()] })
    expect(deps.api.uploadDataUrl).not.toHaveBeenCalled()
  })
})
