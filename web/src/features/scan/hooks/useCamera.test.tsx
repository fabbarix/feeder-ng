import { act, render, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCamera, type MediaDevicesLike } from './useCamera'

function fakeStream(capabilities: Record<string, unknown> = { torch: true }) {
  const track = {
    stop: vi.fn(),
    getCapabilities: vi.fn(() => capabilities),
    applyConstraints: vi.fn(async () => {}),
  }
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
  return { stream, track }
}

function devices(result: Promise<MediaStream>): MediaDevicesLike & { getUserMedia: ReturnType<typeof vi.fn> } {
  return { getUserMedia: vi.fn(() => result) }
}

describe('useCamera', () => {
  it('asks for the rear camera when enabled and becomes ready', async () => {
    const { stream } = fakeStream()
    const md = devices(Promise.resolve(stream))
    const { result } = renderHook(() => useCamera({ enabled: true, mediaDevices: md }))
    expect(result.current.status).toBe('starting')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(md.getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { ideal: 'environment' } }, audio: false })
  })

  it('does not open the camera while disabled', () => {
    const md = devices(Promise.resolve(fakeStream().stream))
    const { result } = renderHook(() => useCamera({ enabled: false, mediaDevices: md }))
    expect(result.current.status).toBe('idle')
    expect(md.getUserMedia).not.toHaveBeenCalled()
  })

  it('stops every track when disabled or unmounted', async () => {
    const { stream, track } = fakeStream()
    const { result, unmount, rerender } = renderHook(({ enabled }) => useCamera({ enabled, mediaDevices: devices(Promise.resolve(stream)) }), {
      initialProps: { enabled: true },
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rerender({ enabled: false })
    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('idle')
    unmount()
  })

  it('stops the tracks on unmount', async () => {
    const { stream, track } = fakeStream()
    const { result, unmount } = renderHook(() => useCamera({ enabled: true, mediaDevices: devices(Promise.resolve(stream)) }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    unmount()
    expect(track.stop).toHaveBeenCalled()
  })

  it.each([['NotAllowedError'], ['SecurityError']])('%s means the camera is denied', async (name) => {
    const err = Object.assign(new Error('no'), { name })
    const { result } = renderHook(() => useCamera({ enabled: true, mediaDevices: { getUserMedia: () => Promise.reject(err) } }))
    await waitFor(() => expect(result.current.status).toBe('denied'))
  })

  it('reports other failures as an error', async () => {
    const { result } = renderHook(() => useCamera({ enabled: true, mediaDevices: { getUserMedia: () => Promise.reject(new Error('busy')) } }))
    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('is unsupported without media devices (no HTTPS)', () => {
    const { result } = renderHook(() => useCamera({ enabled: true, mediaDevices: null }))
    expect(result.current.status).toBe('unsupported')
  })

  it('offers the torch only when the track has the capability, and toggles it', async () => {
    const { stream, track } = fakeStream({ torch: true })
    const { result } = renderHook(() => useCamera({ enabled: true, mediaDevices: devices(Promise.resolve(stream)) }))
    await waitFor(() => expect(result.current.torchSupported).toBe(true))
    await act(() => result.current.toggleTorch())
    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] })
    expect(result.current.torchOn).toBe(true)
    await act(() => result.current.toggleTorch())
    expect(track.applyConstraints).toHaveBeenLastCalledWith({ advanced: [{ torch: false }] })
    expect(result.current.torchOn).toBe(false)
  })

  it('has no torch when the camera cannot', async () => {
    const { stream, track } = fakeStream({})
    const { result } = renderHook(() => useCamera({ enabled: true, mediaDevices: devices(Promise.resolve(stream)) }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.torchSupported).toBe(false)
    await act(() => result.current.toggleTorch())
    expect(track.applyConstraints).not.toHaveBeenCalled()
  })

  it('gives the video element as the frame source while ready', async () => {
    const { stream } = fakeStream()
    function Probe() {
      const cam = useCamera({ enabled: true, mediaDevices: devices(Promise.resolve(stream)) })
      return <video ref={cam.videoRef} data-status={cam.status} data-frame={cam.frame() ? 'yes' : 'no'} />
    }
    const { container } = render(<Probe />)
    await waitFor(() => expect(container.querySelector('video')?.getAttribute('data-status')).toBe('ready'))
    expect(container.querySelector('video')?.srcObject).toBe(stream)
  })
})
