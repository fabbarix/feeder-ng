import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { fakeMedia } from '../testing'
import { useCameraCapture } from './useCameraCapture'

const frame = () => new Blob([new Uint8Array(10)], { type: 'image/jpeg' })

function open(media: ReturnType<typeof fakeMedia>['media'] | null, enabled = true, grabFrame = vi.fn(async () => frame())) {
  const hook = renderHook(({ on }) => useCameraCapture({ enabled: on, mediaDevices: media, grabFrame }), { initialProps: { on: enabled } })
  return { grabFrame, ...hook }
}

describe('useCameraCapture', () => {
  it('opens the rear camera when enabled and becomes ready', async () => {
    const { media } = fakeMedia()
    const { result } = open(media)
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(media.getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    expect(result.current.facing).toBe('environment')
    expect(result.current.needsFallback).toBe(false)
  })

  it('stays closed while disabled', () => {
    const { media } = fakeMedia()
    const { result } = open(media, false)
    expect(result.current.status).toBe('idle')
    expect(media.getUserMedia).not.toHaveBeenCalled()
  })

  it('stops every track when closed or unmounted', async () => {
    const { media, track } = fakeMedia()
    const { result, rerender, unmount } = open(media)
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rerender({ on: false })
    expect(track.stop).toHaveBeenCalledTimes(1)
    rerender({ on: true })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    unmount()
    expect(track.stop).toHaveBeenCalledTimes(2)
  })

  it('capture grabs the current frame of the video, only when ready', async () => {
    const { media } = fakeMedia()
    const { result, grabFrame } = open(media)
    expect(await result.current.capture()).toBeNull()
    expect(grabFrame).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const video = document.createElement('video')
    ;(result.current.videoRef as { current: HTMLVideoElement | null }).current = video
    const blob = await act(() => result.current.capture())
    expect(blob).toBeInstanceOf(Blob)
    expect(grabFrame).toHaveBeenCalledWith(video)
  })

  it.each(['NotAllowedError', 'NotFoundError', 'NotReadableError', 'AbortError'])('%s means the capture input is offered instead', async (name) => {
    const { media } = fakeMedia({ rejectWith: name })
    const { result } = open(media)
    await waitFor(() => expect(result.current.needsFallback).toBe(true))
    expect(result.current.status).not.toBe('ready')
  })

  it('no getUserMedia (plain http) needs the fallback straight away', () => {
    const { result } = open(null)
    expect(result.current.status).toBe('unsupported')
    expect(result.current.needsFallback).toBe(true)
  })

  it('offers the torch only when the track has one, and toggles it', async () => {
    const { media, track } = fakeMedia()
    const { result } = open(media)
    await waitFor(() => expect(result.current.torch.supported).toBe(true))
    await act(async () => result.current.torch.onToggle())
    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] })
    expect(result.current.torch.on).toBe(true)
  })

  it('can switch cameras only when there is more than one, and then asks for the front camera', async () => {
    const one = fakeMedia({ cameras: 1 })
    const single = open(one.media)
    await waitFor(() => expect(single.result.current.status).toBe('ready'))
    expect(single.result.current.canSwitch).toBe(false)

    const two = fakeMedia({ cameras: 2 })
    const { result } = open(two.media)
    await waitFor(() => expect(result.current.canSwitch).toBe(true))
    act(() => result.current.switchCamera())
    await waitFor(() => expect(two.media.getUserMedia).toHaveBeenCalledTimes(2))
    expect(two.media.getUserMedia).toHaveBeenLastCalledWith({ video: { facingMode: { ideal: 'user' } }, audio: false })
    expect(result.current.facing).toBe('user')
    expect(two.track.stop).toHaveBeenCalled()
  })

  it('retry opens the camera again after a failure', async () => {
    const { media } = fakeMedia({ rejectWith: 'NotReadableError' })
    const { result } = open(media)
    await waitFor(() => expect(result.current.needsFallback).toBe(true))
    act(() => result.current.retry())
    await waitFor(() => expect(media.getUserMedia).toHaveBeenCalledTimes(2))
  })
})
