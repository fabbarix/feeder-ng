// The state model of the Photo tab of the Recipe read (docs/dev/design/photo-read.md section 2): a reducer plus selectors.
// Plain TypeScript: no React, no DOM, no Blob reads.
import type { ImageOrigin, RawImage } from '../../../ui/ImagePicker/types'
import type { ImageProblemCode } from '../../../ui/ImagePicker/lib/problems'

// --- Stand-ins, replaced by the ui barrel imports when T1 (ui/ImageEditor) lands. ---------------------------------------------
// Keep this block together: once ui/ImageEditor exports ImageEdit, Rect, Size, initialEdit, isFull and outputSize, delete it and import them.
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}
export interface Size {
  width: number
  height: number
}
/** `turns` quarter turns clockwise; `crop` in pixels of the TURNED working copy. */
export interface ImageEdit {
  turns: 0 | 1 | 2 | 3
  crop: Rect
}
/** The whole picture, no turn. (Real name in T1: `initialEdit`.) */
export function initialEdit(size: Size): ImageEdit {
  return { turns: 0, crop: { x: 0, y: 0, width: size.width, height: size.height } }
}
/** No turn and the whole picture of `size`. (Real name in T1: `isFullEdit`, imported as `isFull`.) */
export function isFull(edit: ImageEdit, size: Size): boolean {
  const c = edit.crop
  return edit.turns === 0 && c.x === 0 && c.y === 0 && c.width === size.width && c.height === size.height
}
/** The crop shrunk so its long side is at most `maxSide`, never enlarged. */
export function outputSize(rect: Rect, maxSide: number): Size {
  const long = Math.max(rect.width, rect.height)
  if (long <= maxSide) return { width: rect.width, height: rect.height }
  const k = maxSide / long
  return { width: Math.max(1, Math.round(rect.width * k)), height: Math.max(1, Math.round(rect.height * k)) }
}
export const READ_MAX_SIDE = 2576
// --- end of the stand-ins ------------------------------------------------------------------------------------------------------

export const MAX_PHOTOS = 4
/** A photo whose long side is under this is "small": a warning, never a block. Defined once, here. */
export const SMALL_PHOTO_SIDE = 1000
/** The smallest crop side of the read, in working-copy pixels (a smaller crop holds no legible text). */
export const READ_MIN_CROP_PX = 160

export type PhotoId = string

export type PhotoSource =
  | { kind: 'image'; working: Blob; width: number; height: number; origin: ImageOrigin }
  | { kind: 'as-is'; blob: Blob; type: 'image/heic' | 'image/heif'; name?: string }
  | { kind: 'link'; url: string }

export type PhotoProblem = ImageProblemCode | 'too_many_photos' | 'render_failed'

export type PhotoOutput =
  | { status: 'pending' }
  | { status: 'ready'; blob: Blob; width: number; height: number; type: string }
  | { status: 'failed'; problem: PhotoProblem }

export interface Photo {
  id: PhotoId
  source: PhotoSource
  edit: ImageEdit | null
  output: PhotoOutput
  revision: number
}

export interface EditSession {
  id: PhotoId
  draft: ImageEdit
  isNew: boolean
}

export interface PanelProblem {
  code: PhotoProblem
  photo?: PhotoId
  count?: number
  limit?: 'original' | 'as-is'
}

export interface PhotoPagesState {
  photos: Photo[]
  editing: EditSession | null
  queue: File[]
  intake: 'idle' | 'preparing'
  problem: PanelProblem | null
  nextId: number
}

export type RenderedOutput = { blob: Blob; width: number; height: number; type: string }

export type PhotoPagesAction =
  | { type: 'intakeStarted' }
  | { type: 'intakeEnded' }
  | { type: 'queued'; files: File[] }
  | { type: 'added'; source: PhotoSource }
  | { type: 'editStarted'; id: PhotoId }
  | { type: 'draftChanged'; draft: ImageEdit }
  | { type: 'editCommitted' }
  | { type: 'editCancelled' }
  | { type: 'removed'; id: PhotoId }
  | { type: 'moved'; from: number; to: number }
  | { type: 'rendered'; id: PhotoId; revision: number; out: RenderedOutput }
  | { type: 'renderFailed'; id: PhotoId; revision: number; problem: PhotoProblem }
  | { type: 'problemSet'; problem: PanelProblem }
  | { type: 'problemCleared' }

export type BlockReason = 'editing' | 'preparing' | { failed: PhotoId } | null

export function initialPhotoPages(): PhotoPagesState {
  return { photos: [], editing: null, queue: [], intake: 'idle', problem: null, nextId: 1 }
}

// --- Stubs: the test author's red phase. The developer replaces every body below. ------------------------------------------------
const todo = (name: string): never => {
  throw new Error(`photoPages.${name}: not implemented`)
}

export function photoPagesReducer(state: PhotoPagesState, _action: PhotoPagesAction): PhotoPagesState {
  return state
}
export function isSmallPhoto(_size: Size): boolean {
  return todo('isSmallPhoto')
}
export function canAdd(_state: PhotoPagesState): boolean {
  return todo('canAdd')
}
export function count(_state: PhotoPagesState): number {
  return todo('count')
}
export function nextToIntake(_state: PhotoPagesState): File | undefined {
  return todo('nextToIntake')
}
export function nextToRender(_state: PhotoPagesState): Photo | undefined {
  return todo('nextToRender')
}
export function readyToSend(_state: PhotoPagesState): boolean {
  return todo('readyToSend')
}
export function blockReason(_state: PhotoPagesState): BlockReason {
  return todo('blockReason')
}
/** `dataUrls`: the data URL of each photo's blob (a `ready` image output, an `as-is` blob), by photo id; links need none. */
export function toReadInput(_state: PhotoPagesState, _dataUrls: Readonly<Record<PhotoId, string>>): { kind: 'photo'; photos: RawImage[] } {
  return todo('toReadInput')
}
export function photoNumber(_state: PhotoPagesState, _id: PhotoId): number {
  return todo('photoNumber')
}
export function draftOutputSize(_state: PhotoPagesState): Size | undefined {
  return todo('draftOutputSize')
}
