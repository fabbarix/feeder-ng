import type { ImageApi, ImageOrigin } from '../types'
import type { ImageEngine } from '../lib/prepare'
import type { ImageProblemCode } from '../lib/problems'

export type IngestPhase = 'idle' | 'preparing' | 'uploading' | 'downloading'

export interface UseImageIngestOptions {
  api: ImageApi
  engine: ImageEngine
  /** Called with the stored image id once the server has the picture. */
  onStored: (id: string) => void
  maxBytes?: number // default MAX_UPLOAD_BYTES
  maxSide?: number // default UPLOAD_MAX_SIDE
}

export interface UseImageIngest {
  phase: IngestPhase
  busy: boolean
  problem: ImageProblemCode | null
  /** Check (type, size), prepare (orient, shrink, maybe re-encode; `turns` rotates), upload, then onStored. A newer call supersedes an older one: the late result is ignored and its stored image is discarded. */
  ingestBlob(blob: Blob, origin: ImageOrigin, opts?: { turns?: 0 | 1 | 2 | 3 }): Promise<void>
  /** Validates the link, then POST /api/images/from-url (the server downloads it). */
  ingestLink(text: string): Promise<void>
  /** Aborts the request in flight; nothing is reported. */
  cancel(): void
  setProblem(code: ImageProblemCode | null): void
  /** Ids this hook uploaded (and has not discarded); the picker discards only these when the user replaces or removes. */
  isOwned(id: string): boolean
  /** Discards an id this hook uploaded (best effort); a no-op for other ids. */
  discardOwned(id: string): void
}

/** IP1 stub: the upload-mode pipeline (no React UI). */
export function useImageIngest(_options: UseImageIngestOptions): UseImageIngest {
  return {
    phase: 'idle',
    busy: false,
    problem: null,
    ingestBlob: async () => {},
    ingestLink: async () => {},
    cancel: () => {},
    setProblem: () => {},
    isOwned: () => false,
    discardOwned: () => {},
  }
}
