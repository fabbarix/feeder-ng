import { useCallback, useEffect, useState, type RefObject } from 'react'
import { useCamera, type CameraStatus } from '../../lib/useCamera'
import type { MediaDevicesLike } from '../types'

export interface UseCameraCaptureOptions {
  enabled: boolean
  mediaDevices: MediaDevicesLike | null
  grabFrame: (video: HTMLVideoElement) => Promise<Blob>
}

export interface UseCameraCapture {
  videoRef: RefObject<HTMLVideoElement | null>
  status: CameraStatus
  facing: 'environment' | 'user'
  /** More than one video input (enumerateDevices) */
  canSwitch: boolean
  switchCamera(): void
  torch: { supported: boolean; on: boolean; onToggle: () => void }
  retry(): void
  /** True after denied / no_camera / in_use / error / unsupported: the UI offers the capture input instead. */
  needsFallback: boolean
  /** Grabs the current frame; null (no-op) unless status is `ready`. */
  capture(): Promise<Blob | null>
}

/** How long a ready stream may take to deliver its first frame before Capture is allowed anyway. */
const FRAME_GRACE_MS = 300

const FAILED: ReadonlySet<CameraStatus> = new Set<CameraStatus>(['denied', 'no_camera', 'in_use', 'error', 'unsupported'])

/** ui/lib/useCamera plus facing, a frame grab and the fallback flag. Tracks are stopped when `enabled` turns false or on unmount (useCamera does that). */
export function useCameraCapture({ enabled, mediaDevices, grabFrame }: UseCameraCaptureOptions): UseCameraCapture {
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [canSwitch, setCanSwitch] = useState(false)
  const camera = useCamera({ enabled, mediaDevices, facingMode: facing })
  const { videoRef } = camera
  const [hasFrame, setHasFrame] = useState(false)

  // A stream that has just opened shows a black frame: stay "starting" until the video delivers one (or a short grace passes, for browsers that do not say).
  useEffect(() => {
    if (camera.status !== 'ready') {
      setHasFrame(false)
      return
    }
    const video = videoRef.current
    const done = () => setHasFrame(true)
    if (video && video.readyState >= 2) return done()
    video?.addEventListener('loadeddata', done)
    video?.addEventListener('playing', done)
    const timer = setTimeout(done, FRAME_GRACE_MS)
    return () => {
      clearTimeout(timer)
      video?.removeEventListener('loadeddata', done)
      video?.removeEventListener('playing', done)
    }
  }, [camera.status, videoRef])

  const status: CameraStatus = camera.status === 'ready' && !hasFrame ? 'starting' : camera.status

  useEffect(() => {
    if (!enabled) setFacing('environment')
  }, [enabled])

  // Enumerating devices before permission is granted hides their number, so ask once the camera is running.
  useEffect(() => {
    if (!enabled || status !== 'ready' || typeof mediaDevices?.enumerateDevices !== 'function') return
    let cancelled = false
    void mediaDevices
      .enumerateDevices()
      .then((devices) => {
        if (!cancelled) setCanSwitch(devices.filter((d) => d.kind === 'videoinput').length > 1)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [enabled, status, mediaDevices])

  const switchCamera = useCallback(() => setFacing((f) => (f === 'environment' ? 'user' : 'environment')), [])

  const capture = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current
    if (status !== 'ready' || !video) return null
    return grabFrame(video)
  }, [status, videoRef, grabFrame])

  return {
    videoRef,
    status,
    facing,
    canSwitch,
    switchCamera,
    torch: { supported: camera.torchSupported, on: camera.torchOn, onToggle: () => void camera.toggleTorch() },
    retry: camera.retry,
    needsFallback: FAILED.has(status),
    capture,
  }
}
