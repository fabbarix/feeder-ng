import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeMedia } from '../ImagePicker/testing'
import { useCamera } from './useCamera'

// The shared camera hook (moved from features/scan/hooks) gains a facingMode option; the default constraints must not change for the scanner.
describe('ui/lib/useCamera', () => {
  it('still asks for the rear camera by default (the scanner depends on it)', async () => {
    const { media } = fakeMedia()
    const { result } = renderHook(() => useCamera({ enabled: true, mediaDevices: media }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(media.getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { ideal: 'environment' } }, audio: false })
  })

  it('facingMode: "user" asks for the front camera', async () => {
    const { media } = fakeMedia()
    const { result } = renderHook(() => useCamera({ enabled: true, mediaDevices: media, facingMode: 'user' }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(media.getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { ideal: 'user' } }, audio: false })
  })

  it('changing facingMode reopens the camera and stops the old stream', async () => {
    const { media, track } = fakeMedia()
    const { result, rerender } = renderHook(({ f }) => useCamera({ enabled: true, mediaDevices: media, facingMode: f }), { initialProps: { f: 'environment' as 'environment' | 'user' } })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rerender({ f: 'user' })
    await waitFor(() => expect(media.getUserMedia).toHaveBeenCalledTimes(2))
    expect(track.stop).toHaveBeenCalled()
  })
})
