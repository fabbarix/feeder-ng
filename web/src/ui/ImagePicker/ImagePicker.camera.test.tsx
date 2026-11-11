import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImagePicker } from './ImagePicker'
import { fakeDeps, fakeMedia, ID_A, pngFile } from './testing'

const user = userEvent.setup({ applyAccept: false })

function setup(media: ReturnType<typeof fakeMedia>['media'] | null) {
  const deps = fakeDeps({ mediaDevices: media })
  const onChange = vi.fn()
  const view = render(<ImagePicker label="Recipe photo" value="" onChange={onChange} deps={deps} />)
  return { deps, onChange, ...view }
}
const camera = () => screen.getByRole('region', { name: 'Camera' })

afterEach(() => vi.unstubAllGlobals())

describe('ImagePicker, camera viewfinder', () => {
  it('Take photo opens the shared viewfinder (photo size, labelled Camera), starting the rear camera', async () => {
    const { media } = fakeMedia()
    setup(media)
    await user.click(screen.getByRole('button', { name: 'Take photo' }))
    expect(media.getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    expect(camera()).toHaveClass('viewfinder-strip')
    expect(camera()).toHaveAttribute('data-size', 'photo')
    expect(screen.getByRole('button', { name: 'Close camera' })).toBeInTheDocument()
  })

  it('Capture is disabled until the camera is ready, then grabs a frame and uploads it', async () => {
    const { media, track } = fakeMedia()
    const { deps, onChange } = setup(media)
    await user.click(screen.getByRole('button', { name: 'Take photo' }))
    const capture = screen.getByRole('button', { name: 'Capture' })
    expect(within(camera()).getByText('Starting the camera')).toBeInTheDocument()
    expect(capture).toBeDisabled()
    await waitFor(() => expect(capture).toBeEnabled())
    await user.click(capture)
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(ID_A))
    expect(deps.grabFrame).toHaveBeenCalledTimes(1)
    expect(deps.engine.encode).toHaveBeenCalled() // a camera frame is always normalised
    expect(deps.api.uploadDataUrl).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('region', { name: 'Camera' })).not.toBeInTheDocument()
    expect(track.stop).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Take photo' })).toHaveFocus()
  })

  it('offers the torch (the viewfinder primitive button) when the camera has one', async () => {
    const { media } = fakeMedia()
    setup(media)
    await user.click(screen.getByRole('button', { name: 'Take photo' }))
    expect(await within(camera()).findByRole('button', { name: 'Torch off' })).toBeInTheDocument()
  })

  it('offers Switch camera only when the device has more than one', async () => {
    const one = fakeMedia({ cameras: 1 })
    const { unmount } = setup(one.media)
    await user.click(screen.getByRole('button', { name: 'Take photo' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Capture' })).toBeEnabled())
    expect(screen.queryByRole('button', { name: 'Switch camera' })).not.toBeInTheDocument()
    unmount()

    const two = fakeMedia({ cameras: 2 })
    setup(two.media)
    await user.click(screen.getByRole('button', { name: 'Take photo' }))
    await user.click(await screen.findByRole('button', { name: 'Switch camera' }))
    await waitFor(() => expect(two.media.getUserMedia).toHaveBeenLastCalledWith({ video: { facingMode: { ideal: 'user' } }, audio: false }))
  })

  it('Close camera, Escape and unmounting all release the camera', async () => {
    const a = fakeMedia()
    const first = setup(a.media)
    await user.click(screen.getByRole('button', { name: 'Take photo' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Capture' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Close camera' }))
    expect(a.track.stop).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('region', { name: 'Camera' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Take photo' })).toHaveFocus()
    first.unmount()

    const b = fakeMedia()
    const second = setup(b.media)
    await user.click(screen.getByRole('button', { name: 'Take photo' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Capture' })).toBeEnabled())
    await user.keyboard('{Escape}')
    expect(b.track.stop).toHaveBeenCalledTimes(1)
    second.unmount()

    const c = fakeMedia()
    const third = setup(c.media)
    await user.click(screen.getByRole('button', { name: 'Take photo' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Capture' })).toBeEnabled())
    third.unmount()
    expect(c.track.stop).toHaveBeenCalledTimes(1)
  })

  it('opening Paste link closes the camera', async () => {
    const { media, track } = fakeMedia()
    setup(media)
    await user.click(screen.getByRole('button', { name: 'Take photo' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Capture' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Paste link' }))
    expect(screen.queryByRole('region', { name: 'Camera' })).not.toBeInTheDocument()
    expect(track.stop).toHaveBeenCalled()
  })
})

describe('ImagePicker, camera fallback (capture input)', () => {
  it.each(['NotAllowedError', 'NotFoundError', 'NotReadableError'])('%s: says the camera cannot be used and offers the camera app', async (name) => {
    const { media } = fakeMedia({ rejectWith: name })
    setup(media)
    await user.click(screen.getByRole('button', { name: 'Take photo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/camera/i)
    expect(screen.getByRole('button', { name: 'Use the camera app' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Capture' })).not.toBeInTheDocument()
  })

  it('Use the camera app opens the hidden input with capture="environment"; the photo is uploaded like a camera frame', async () => {
    const { media } = fakeMedia({ rejectWith: 'NotAllowedError' })
    const { container, deps, onChange } = setup(media)
    await user.click(screen.getByRole('button', { name: 'Take photo' }))
    const click = vi.spyOn(HTMLInputElement.prototype, 'click')
    await user.click(await screen.findByRole('button', { name: 'Use the camera app' }))
    expect(click).toHaveBeenCalled()
    click.mockRestore()
    const input = container.querySelector<HTMLInputElement>('input[type=file][capture]')!
    expect(input).toHaveAttribute('capture', 'environment')
    expect(input).toHaveAttribute('accept', 'image/*')
    expect(input).toHaveAttribute('hidden')
    await user.upload(input, pngFile('IMG_1.jpg'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(ID_A))
    expect(deps.engine.encode).toHaveBeenCalled() // fixes EXIF orientation and shrinks
  })

  it('a phone without getUserMedia (plain http) gets Take photo that opens the camera app directly', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('pointer: coarse'), media: q, addEventListener() {}, removeEventListener() {} }))
    const { container } = setup(null)
    const click = vi.spyOn(HTMLInputElement.prototype, 'click')
    await user.click(screen.getByRole('button', { name: 'Take photo' }))
    expect(click).toHaveBeenCalled()
    click.mockRestore()
    expect(container.querySelector('input[type=file][capture]')).not.toBeNull()
    expect(screen.queryByRole('region', { name: 'Camera' })).not.toBeInTheDocument()
  })

  it('a desktop without getUserMedia offers no camera at all', () => {
    setup(null)
    expect(screen.queryByRole('button', { name: 'Take photo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use the camera app' })).not.toBeInTheDocument()
  })
})
