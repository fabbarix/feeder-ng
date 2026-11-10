import type { ImageEngine } from './lib/prepare'
import type { ClipboardLike } from './lib/clipboard'
import type { CropAspect } from './lib/crop'

/** Where a picture can come from; `sources` on the picker chooses which buttons exist. */
export type ImageSource = 'file' | 'paste' | 'link' | 'camera'
/** How a picture actually arrived (reported with raw results). `drop` is a file dragged in. */
export type ImageOrigin = 'file' | 'drop' | 'paste' | 'link' | 'camera'

/** What the server answers to POST /api/images and POST /api/images/from-url. */
export interface StoredImage {
  id: string
  url: string
  width: number
  height: number
}

/** The picker's only HTTP surface (default: ./api.ts). Tests and the Recipe Assistant can replace it. */
export interface ImageApi {
  uploadDataUrl(dataUrl: string, opts?: { signal?: AbortSignal }): Promise<StoredImage>
  /** The SERVER downloads the link (SSRF-protected). */
  ingestUrl(url: string, opts?: { signal?: AbortSignal }): Promise<StoredImage>
  /** Best effort: never throws. 409 (the image is in use) and 404 are fine. */
  discard(id: string): Promise<void>
  /** Fetches an already stored image (for Rotate in upload mode). */
  loadBlob(url: string): Promise<Blob>
}

export interface MediaDevicesLike {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>
  enumerateDevices?(): Promise<{ kind: string }[]>
}

/** Seams for tests (and for hosts without a real browser API). Every field defaults to the browser. */
export interface ImagePickerDeps {
  api: ImageApi
  engine: ImageEngine
  /** null = no getUserMedia (plain http, old browser). */
  mediaDevices: MediaDevicesLike | null
  clipboard: ClipboardLike | null
  /** Draws the current video frame at its native size and returns a JPEG. */
  grabFrame: (video: HTMLVideoElement) => Promise<Blob>
  objectUrls: { create(blob: Blob): string; revoke(url: string): void }
}

/** The result of raw mode. A pasted link is passed through untouched (the consumer's server fetches it). */
export type RawImage =
  | { kind: 'blob'; blob: Blob; dataUrl?: string; width: number; height: number; type: string; origin: ImageOrigin }
  | { kind: 'url'; url: string }

interface ImagePickerCommon {
  /** The visible heading and the accessible name of the group, e.g. "Recipe photo". */
  label: string
  helper?: string
  /** An error from the host (e.g. a failed save); the picker's own problems are shown too, this one wins. */
  error?: string
  disabled?: boolean
  /** Default: all four. */
  sources?: readonly ImageSource[]
  /** `dialog` also listens for paste on the enclosing <dialog>/BottomSheet, so Ctrl+V works wherever focus is inside it. Default `picker`. */
  listenOn?: 'picker' | 'dialog'
  /**
   * Shape of the Crop tool: a number (`width / height`, e.g. CROP_ASPECTS.landscape = 4/3 for Recipe and Ingredient images, CROP_ASPECTS.square = 1 for
   * a Member avatar) locks it; 'free' lets the user choose. Default: 4/3 in upload mode, 'free' in raw mode.
   */
  aspect?: CropAspect
  /** Offer the Crop button next to Rotate. Default true. */
  crop?: boolean
  /** Preview size. Default `hero`. */
  size?: 'hero' | 72
  deps?: Partial<ImagePickerDeps>
}

/** Entity photos: the picture is sent to the server and the host keeps the image id. */
export interface UploadImagePickerProps extends ImagePickerCommon {
  mode?: 'upload'
  /** The stored image id, '' for none. */
  value: string
  /** The new image id, or '' when removed. */
  onChange: (imageId: string) => void
}

/** Recipe Assistant "Read from a photo": nothing is uploaded; the host receives a downscaled Blob/data URL (or the pasted link). */
export interface RawImagePickerProps extends ImagePickerCommon {
  mode: 'raw'
  value: RawImage | null
  onChange: (image: RawImage | null) => void
  /** Long edge in px. Default 2576. */
  maxSide?: number
  /** Byte limit of the result. Default 8 MB. */
  maxBytes?: number
  /** Default `blob`; `dataUrl` adds the data URL (and keeps the blob). */
  output?: 'blob' | 'dataUrl'
}

export type ImagePickerProps = UploadImagePickerProps | RawImagePickerProps
