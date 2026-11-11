import { imageApi } from '../api'
import type { ImagePickerDeps } from '../types'
import { browserEngine, grabVideoFrame } from './prepare'

const OBJECT_URLS: ImagePickerDeps['objectUrls'] = { create: (blob) => URL.createObjectURL(blob), revoke: (url) => URL.revokeObjectURL(url) }

/** The browser's own implementations; any of them can be replaced through the `deps` prop (tests do). */
export function resolveDeps(over: Partial<ImagePickerDeps> | undefined): ImagePickerDeps {
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  return {
    api: imageApi,
    engine: browserEngine,
    mediaDevices: (nav?.mediaDevices as ImagePickerDeps['mediaDevices'] | undefined) ?? null,
    clipboard: (nav?.clipboard as ImagePickerDeps['clipboard'] | undefined) ?? null,
    grabFrame: grabVideoFrame,
    objectUrls: OBJECT_URLS,
    ...over,
  }
}

/** What the camera strategy needs to know about this browser. */
export function cameraEnvironment(mediaDevices: ImagePickerDeps['mediaDevices']) {
  const standalone = typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true
  const coarse = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  return { hasGetUserMedia: typeof mediaDevices?.getUserMedia === 'function', coarsePointer: coarse, iosStandalone: standalone }
}
