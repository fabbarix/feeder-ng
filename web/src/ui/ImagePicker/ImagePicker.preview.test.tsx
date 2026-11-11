import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ImagePicker } from './ImagePicker'
import { fakeApi, fakeDeps, ID_A, ID_B, ID_C, pngFile, stored } from './testing'

const user = userEvent.setup({ applyAccept: false })

/** A host that keeps the id in state, like a form does. */
function Host({ initial = '', deps, onValue }: { initial?: string; deps: ReturnType<typeof fakeDeps>; onValue?: (v: string) => void }) {
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
    />
  )
}

const fileInput = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[type=file]:not([capture])')!

describe('ImagePicker, preview / replace / remove', () => {
  it('shows the stored image, named after the picker, with Replace, Rotate and Remove', () => {
    render(<Host initial={ID_A} deps={fakeDeps()} />)
    expect(screen.getByRole('img', { name: 'Recipe photo' })).toHaveAttribute('src', `/api/images/${ID_A}`)
    expect(screen.getByRole('button', { name: /Replace image/ })).toBeInTheDocument()
    for (const name of ['Rotate left', 'Rotate right', 'Remove image']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
  })

  it('Remove tells the host with an empty id; a stored image the picker did not upload is NOT deleted on the server', async () => {
    const deps = fakeDeps()
    const onValue = vi.fn()
    render(<Host initial={ID_A} deps={deps} onValue={onValue} />)
    await user.click(screen.getByRole('button', { name: 'Remove image' }))
    expect(onValue).toHaveBeenCalledWith('')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(deps.api.discard).not.toHaveBeenCalled()
  })

  it('an image the picker itself uploaded and then removed is discarded at once (never-saved photo, no orphan)', async () => {
    const deps = fakeDeps()
    const { container } = render(<Host deps={deps} />)
    await user.upload(fileInput(container), pngFile())
    await screen.findByRole('img', { name: 'Recipe photo' })
    await user.click(screen.getByRole('button', { name: 'Remove image' }))
    expect(deps.api.discard).toHaveBeenCalledWith(ID_A)
  })

  it('replacing an image the picker uploaded discards the old one; replacing a host-provided one does not', async () => {
    const api = fakeApi({ uploadDataUrl: vi.fn().mockResolvedValueOnce(stored(ID_B)).mockResolvedValueOnce(stored(ID_C)) })
    const deps = fakeDeps({ api })
    const { container } = render(<Host initial={ID_A} deps={deps} />)
    await user.upload(fileInput(container), pngFile())
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', `/api/images/${ID_B}`))
    expect(api.discard).not.toHaveBeenCalled() // ID_A belongs to the host's saved entity
    await user.upload(fileInput(container), pngFile())
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', `/api/images/${ID_C}`))
    expect(api.discard).toHaveBeenCalledWith(ID_B)
    expect(api.discard).not.toHaveBeenCalledWith(ID_A)
  })

  it('Rotate right re-encodes the stored image turned once and swaps in the new id', async () => {
    const deps = fakeDeps({ api: fakeApi({ uploadDataUrl: vi.fn(async () => stored(ID_B)) }) })
    const onValue = vi.fn()
    render(<Host initial={ID_A} deps={deps} onValue={onValue} />)
    await user.click(screen.getByRole('button', { name: 'Rotate right' }))
    await waitFor(() => expect(onValue).toHaveBeenCalledWith(ID_B))
    expect(deps.api.loadBlob).toHaveBeenCalledWith(`/api/images/${ID_A}`)
    expect(deps.engine.encode.mock.calls[0]![1]).toMatchObject({ turns: 1, width: 600, height: 800 })
    expect(deps.api.uploadDataUrl).toHaveBeenCalledTimes(1)
  })

  it('Rotate left turns the other way', async () => {
    const deps = fakeDeps()
    render(<Host initial={ID_A} deps={deps} />)
    await user.click(screen.getByRole('button', { name: 'Rotate left' }))
    await waitFor(() => expect(deps.engine.encode).toHaveBeenCalled())
    expect(deps.engine.encode.mock.calls[0]![1]).toMatchObject({ turns: 3 })
  })

  it('a preview that fails to load says so and still offers Replace and Remove', async () => {
    render(<Host initial={ID_A} deps={fakeDeps()} />)
    fireEvent.error(screen.getByRole('img', { name: 'Recipe photo' }))
    expect(await screen.findByText('The image could not be shown.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove image' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Replace image/ })).toBeInTheDocument()
  })

  it('rotate and remove are locked while a pick is in flight', async () => {
    const api = fakeApi({ uploadDataUrl: vi.fn(() => new Promise<ReturnType<typeof stored>>(() => {})) })
    const { container } = render(<Host initial={ID_A} deps={fakeDeps({ api })} />)
    await user.upload(fileInput(container), pngFile())
    await screen.findByRole('status')
    for (const name of ['Rotate left', 'Rotate right', 'Remove image']) expect(screen.getByRole('button', { name })).toBeDisabled()
  })
})
