// Opens the rear camera, exposes the video element and the torch (functional spec §10.4). React hook; the media
// API is injected so tests use a fake. Stubs until implemented.
import type { RefObject } from 'react'

export type CameraStatus = 'idle' | 'starting' | 'ready' | 'denied' | 'unsupported' | 'error'

export interface MediaDevicesLike {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>
}

export interface UseCameraOptions {
  /** false keeps the camera closed */
  enabled: boolean
  /** default navigator.mediaDevices; absent means `unsupported` (also the case without HTTPS) */
  mediaDevices?: MediaDevicesLike | null
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
  /** the frame source for useScanner: the video element while ready */
  frame(): CanvasImageSource | null
}

/**
 * Requests { video: { facingMode: { ideal: 'environment' } } } when enabled and releases it (stops every track)
 * when disabled or unmounted. NotAllowedError/SecurityError -> `denied`; no mediaDevices or no getUserMedia ->
 * `unsupported`; any other failure -> `error`.
 */
export function useCamera(options: UseCameraOptions): UseCameraResult {
  void options
  throw new Error('not implemented')
}
