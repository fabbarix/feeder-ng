// The state owner of the Photo tab (docs/dev/design/photo-read.md section 4.1; photo-store.md phase 2). STUB: the types are final, the body is the developer's.
import type { ClipboardDataLike, ImageEdit, ImageOrigin, ReadImageEngine } from '../../../ui'
import { initialPhotoPages, type PhotoId, type PhotoPagesState } from '../lib/photoPages'
import type { PhotoStore } from '../lib/photoStore'
import type { ReadInput } from '../types'

export interface UsePhotoPages {
  state: PhotoPagesState
  /** One object URL per photo for the list: the output once ready, else the working copy; undefined for 'as-is' and 'link' (never made from a link's placeholder Blob). */
  previewUrl(id: PhotoId): string | undefined
  /** The working copy's URL for the editor (always the working copy, never the output). */
  editorUrl: string | undefined
  addFiles(files: File[], origin: ImageOrigin): void
  addLink(text: string): void
  onPaste(data: ClipboardDataLike | null): void
  edit(id: PhotoId): void
  setDraft(draft: ImageEdit): void
  commit(): void
  cancel(): void
  remove(id: PhotoId): void
  move(from: number, to: number): void
  dismissProblem(): void
  /** An intake or a render is running. */
  busy: boolean
  /** readyToSend(state). */
  canRead: boolean
  /** The ReadInput for useRecipeRead.start: data URLs made now, in list order. */
  toReadInput(): Promise<Extract<ReadInput, { kind: 'photo' }>>
  /** How many of the listed photos came back from the device and are still listed (0 = no "from before" message). */
  restoredCount: number
  /** The restore message's Remove: removes every photo and empties the device store. */
  removeRestored(): void
  /** The read finished with a review: empties the list and the device store. A failed read, or Try again, never calls it. */
  finished(): void
}

export interface PhotoPagesDeps {
  engine: ReadImageEngine
  /** What useObjectUrls takes. */
  objectUrls: { create: (blob: Blob) => string; revoke: (url: string) => void }
  /** The on-device store (default appPhotoStore()). */
  store: PhotoStore
}

export function usePhotoPages(_deps?: Partial<PhotoPagesDeps>): UsePhotoPages {
  void _deps
  throw new Error('usePhotoPages: not implemented')
  // eslint-disable-next-line no-unreachable
  return { state: initialPhotoPages() } as unknown as UsePhotoPages
}
