import type { RefObject } from 'react'
import type { CameraStatus } from '../../lib/useCamera'
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

/** IP1 stub: ui/lib/useCamera plus facing, a frame grab and the fallback flag. Tracks are stopped when `enabled` turns false or on unmount (useCamera does that). */
export function useCameraCapture(_options: UseCameraCaptureOptions): UseCameraCapture {
  return {
    videoRef: { current: null },
    status: 'idle',
    facing: 'environment',
    canSwitch: false,
    switchCamera: () => {},
    torch: { supported: false, on: false, onToggle: () => {} },
    retry: () => {},
    needsFallback: false,
    capture: async () => null,
  }
}
