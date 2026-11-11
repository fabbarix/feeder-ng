// Opens a camera (the rear one by default), exposes the video element and the torch (functional spec §10.4). React hook; the media
// API is injected so tests use a fake. Shared by the barcode scanner (features/scan re-exports it) and the ImagePicker.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export type CameraStatus = 'idle' | 'starting' | 'ready' | 'denied' | 'unsupported' | 'no_camera' | 'in_use' | 'error'

export interface MediaDevicesLike {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>
}

export interface UseCameraOptions {
  /** false keeps the camera closed */
  enabled: boolean
  /** default navigator.mediaDevices; absent means `unsupported` (also the case without HTTPS) */
  mediaDevices?: MediaDevicesLike | null
  /** Default 'environment' (rear camera); the picker's "Switch camera" passes 'user'. Changing it reopens the camera. */
  facingMode?: 'environment' | 'user'
}

export interface UseCameraResult {
  /** attach to the <video>; the hook sets srcObject and plays it */
  videoRef: RefObject<HTMLVideoElement | null>
  status: CameraStatus
  /** the track reports a `torch` capability */
  torchSupported: boolean
  torchOn: boolean
  /** applies { advanced: [{ torch }] } to the video track; does nothing when unsupported */
  toggleTorch(): Promise<void>
  /** B4: tries again after a failure (denied, no_camera, in_use, error); no-op in other states. */
  retry(): void
  /** the frame source for useScanner: the video element while ready */
  frame(): CanvasImageSource | null
}

const constraintsFor = (facingMode: 'environment' | 'user'): MediaStreamConstraints => ({ video: { facingMode: { ideal: facingMode } }, audio: false })

type TorchTrack = {
  getCapabilities?: () => Record<string, unknown>
  applyConstraints: (c: MediaTrackConstraints) => Promise<void>
}

function stopAll(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop())
}

function defaultMediaDevices(): MediaDevicesLike | null {
  if (typeof navigator === 'undefined') return null
  return (navigator.mediaDevices as MediaDevicesLike | undefined) ?? null
}

/** The status a failed getUserMedia call means (B4). */
export function statusForCameraError(name: string): CameraStatus {
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'no_camera'
    case 'NotReadableError':
    case 'TrackStartError':
      return 'in_use'
    default:
      return 'error'
  }
}

const FAILED: ReadonlySet<CameraStatus> = new Set<CameraStatus>(['denied', 'no_camera', 'in_use', 'error'])

/**
 * Requests the camera (`facingMode`, rear by default) when enabled and releases it (stops every track) when disabled or unmounted.
 * NotAllowedError/SecurityError -> `denied`; NotFoundError/DevicesNotFoundError -> `no_camera`;
 * NotReadableError/TrackStartError -> `in_use`; no mediaDevices or no getUserMedia -> `unsupported`; any other failure -> `error`.
 * retry() asks again after a failure.
 */
export function useCamera(options: UseCameraOptions): UseCameraResult {
  const { enabled } = options
  const facingMode = options.facingMode ?? 'environment'
  const mediaDevices = options.mediaDevices === undefined ? defaultMediaDevices() : options.mediaDevices
  // Read through a ref: a new MediaDevices object per render must not restart the camera.
  const mediaRef = useRef(mediaDevices)
  mediaRef.current = mediaDevices
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const trackRef = useRef<TorchTrack | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) {
      stopAll(streamRef.current)
      streamRef.current = null
      trackRef.current = null
      setTorchSupported(false)
      setTorchOn(false)
      setStatus('idle')
      return
    }
    const md = mediaRef.current
    if (!md || typeof md.getUserMedia !== 'function') {
      setStatus('unsupported')
      return
    }
    let cancelled = false
    setStatus('starting')
    md
      .getUserMedia(constraintsFor(facingMode))
      .then((stream) => {
        if (cancelled) {
          stopAll(stream)
          return
        }
        streamRef.current = stream
        const track = stream.getVideoTracks()[0] as unknown as TorchTrack | undefined
        trackRef.current = track ?? null
        setTorchSupported(Boolean(track?.getCapabilities?.().torch))
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          try {
            void video.play()?.catch(() => {})
          } catch {
            // Autoplay is blocked or unavailable; the frame is still readable once the stream has data.
          }
        }
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const name = err instanceof Error ? err.name : ''
        setStatus(statusForCameraError(name))
      })
    return () => {
      cancelled = true
      stopAll(streamRef.current)
      streamRef.current = null
      trackRef.current = null
    }
    // attempt is only a trigger: retry() bumps it to open the camera again.
  }, [enabled, attempt, facingMode])

  const retry = useCallback(() => {
    if (enabled && FAILED.has(status)) setAttempt((n) => n + 1)
  }, [enabled, status])

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current
    if (!track || !torchSupported) return
    const next = !torchOn
    await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints)
    setTorchOn(next)
  }, [torchOn, torchSupported])

  const frame = useCallback((): CanvasImageSource | null => (status === 'ready' ? videoRef.current : null), [status])

  return { videoRef, status, torchSupported, torchOn, toggleTorch, retry, frame }
}
