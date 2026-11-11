import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/http'
import { ImagePicker } from './ImagePicker'
import { fakeApi, fakeDeps, ID_B, paste, stored } from './testing'

const user = userEvent.setup({ applyAccept: false })

function setup(api = fakeApi()) {
  const deps = fakeDeps({ api })
  const onChange = vi.fn()
  render(<ImagePicker label="Recipe photo" value="" onChange={onChange} deps={deps} />)
  return { deps, onChange }
}
const open = async () => {
  await user.click(screen.getByRole('button', { name: 'Paste link' }))
  return screen.getByRole('textbox', { name: 'Image link' })
}

describe('ImagePicker, from a link', () => {
  it('Paste link opens a labelled field and focuses it', async () => {
    setup()
    const field = await open()
    expect(field).toHaveFocus()
    expect(screen.getByText(/Feeder downloads the picture/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use link' })).toBeInTheDocument()
  })

  it('Use link sends the https link to the server, which downloads it; the host gets the image id', async () => {
    const { deps, onChange } = setup()
    const field = await open()
    await user.type(field, 'https://photos.example/soup.png')
    await user.click(screen.getByRole('button', { name: 'Use link' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(ID_B))
    expect((deps.api.ingestUrl.mock.calls[0] as unknown as [string])[0]).toBe('https://photos.example/soup.png')
    expect(screen.queryByRole('textbox', { name: 'Image link' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Paste link' })).toHaveFocus()
  })

  it('Enter submits', async () => {
    const { deps } = setup()
    const field = await open()
    await user.type(field, 'https://photos.example/soup.png{Enter}')
    await waitFor(() => expect(deps.api.ingestUrl).toHaveBeenCalledTimes(1))
  })

  it('an http link is refused in the field, before any request, and the panel stays open', async () => {
    const { deps } = setup()
    const field = await open()
    await user.type(field, 'http://photos.example/soup.png{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(/https/)
    expect(deps.api.ingestUrl).not.toHaveBeenCalled()
    expect(field).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
  })

  it('an empty field asks for a link', async () => {
    const { deps } = setup()
    await open()
    await user.click(screen.getByRole('button', { name: 'Use link' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(deps.api.ingestUrl).not.toHaveBeenCalled()
  })

  it('a private address refused by the server is explained in the panel', async () => {
    const api = fakeApi({ ingestUrl: vi.fn().mockRejectedValue(new ApiError(422, 'image_url_blocked', 'x')) })
    setup(api)
    const field = await open()
    await user.type(field, 'https://10.0.0.5/a.png{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(/private/i)
    expect(field).toBeInTheDocument()
  })

  it('a download that fails (404, timeout) says the image could not be downloaded', async () => {
    const api = fakeApi({ ingestUrl: vi.fn().mockRejectedValue(new ApiError(502, 'image_url_unreachable', 'x')) })
    setup(api)
    await user.type(await open(), 'https://photos.example/gone.png{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(/download/i)
  })

  it('shows the downloading status and locks Use link while the server fetches', async () => {
    const api = fakeApi({ ingestUrl: vi.fn(() => new Promise<ReturnType<typeof stored>>(() => {})) })
    setup(api)
    await user.type(await open(), 'https://photos.example/slow.png{Enter}')
    expect(await screen.findByRole('status')).toHaveTextContent(/Downloading the image/)
    expect(screen.getByRole('button', { name: 'Use link' })).toBeDisabled()
  })

  it('Escape and Cancel close the panel and give the focus back to Paste link', async () => {
    setup()
    await open()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox', { name: 'Image link' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Paste link' })).toHaveFocus()
    await open()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('textbox', { name: 'Image link' })).not.toBeInTheDocument()
  })

  it('pasting text into the link field is plain text pasting: the picker does not hijack it', async () => {
    const { deps } = setup()
    const field = await open()
    const event = paste(field, { text: 'https://photos.example/soup.png' })
    expect(event.defaultPrevented).toBe(false)
    expect(deps.api.ingestUrl).not.toHaveBeenCalled()
  })
})
