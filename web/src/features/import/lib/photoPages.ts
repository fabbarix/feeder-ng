// The state model of the Photo tab of the Recipe read (docs/dev/design/photo-read.md section 2): a reducer plus selectors.
// Plain TypeScript: no React, no DOM, no Blob reads.
import type { ImageOrigin, RawImage } from '../../../ui/ImagePicker/types'
import type { ImageProblemCode } from '../../../ui/ImagePicker/lib/problems'
import { moveItem } from '../../../ui/Sortable/reorder'

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

// --- The reducer and the selectors ----------------------------------------------------------------------------------------------

/** Photos plus queued files plus the file being prepared: what is left of the four. */
function roomFor(state: PhotoPagesState): number {
  return MAX_PHOTOS - state.photos.length - state.queue.length - (state.intake === 'preparing' ? 1 : 0)
}

/** The size of an image photo's working copy (the editor works on it). */
function workingSize(source: PhotoSource): Size | undefined {
  return source.kind === 'image' ? { width: source.width, height: source.height } : undefined
}

function updatePhoto(state: PhotoPagesState, id: PhotoId, change: (p: Photo) => Photo): PhotoPagesState {
  return { ...state, photos: state.photos.map((p) => (p.id === id ? change(p) : p)) }
}

/** Applies a render answer only when it is for the photo's current revision. */
function answerRender(state: PhotoPagesState, id: PhotoId, revision: number, output: PhotoOutput): PhotoPagesState {
  const current = state.photos.some((p) => p.id === id && p.revision === revision)
  return current ? updatePhoto(state, id, (p) => ({ ...p, output })) : state
}

export function photoPagesReducer(state: PhotoPagesState, action: PhotoPagesAction): PhotoPagesState {
  switch (action.type) {
    case 'intakeStarted':
      return { ...state, queue: state.queue.slice(1), intake: 'preparing' }

    case 'intakeEnded':
      return { ...state, intake: 'idle' }

    case 'queued': {
      const room = Math.max(0, roomFor(state))
      const kept = action.files.slice(0, room)
      const dropped = action.files.length - kept.length
      return {
        ...state,
        queue: [...state.queue, ...kept],
        problem: dropped > 0 ? { code: 'too_many_photos', count: dropped } : state.problem,
      }
    }

    case 'added': {
      // A prepared image or as-is file already holds its intake slot, so it counts photos + queue only. A link is not prepared,
      // so while a file is being prepared it also takes that slot into account.
      const isLink = action.source.kind === 'link'
      const taken = state.photos.length + state.queue.length + (isLink && state.intake === 'preparing' ? 1 : 0)
      if (taken >= MAX_PHOTOS) return { ...state, problem: { code: 'too_many_photos' } }
      const id = `p${state.nextId}`
      const source = action.source
      let photo: Photo
      let editing = state.editing
      if (source.kind === 'image') {
        photo = { id, source, edit: null, output: { status: 'pending' }, revision: 0 }
        // An open session is never replaced by an add: the new photo then waits as a whole picture until it is edited.
        if (!editing) editing = { id, draft: initialEdit({ width: source.width, height: source.height }), isNew: true }
      } else if (source.kind === 'as-is') {
        // Nothing to render: the declared file is sent as it is.
        photo = { id, source, edit: null, output: { status: 'ready', blob: source.blob, width: 0, height: 0, type: source.type }, revision: 0 }
      } else {
        // A link has no blob here; the server fetches it, so its output is a ready placeholder with no bytes.
        photo = { id, source, edit: null, output: { status: 'ready', blob: new Blob([]), width: 0, height: 0, type: '' }, revision: 0 }
      }
      // "N left out" (too_many_photos with a count) stays until dismissed or replaced; any other message is cleared only when the pick is over.
      const keepProblem = (state.problem?.code === 'too_many_photos' && state.problem.count !== undefined) || state.queue.length > 0
      return {
        ...state,
        photos: [...state.photos, photo],
        editing,
        nextId: state.nextId + 1,
        problem: keepProblem ? state.problem : null,
      }
    }

    case 'editStarted': {
      const photo = state.photos.find((p) => p.id === action.id)
      const size = photo ? workingSize(photo.source) : undefined
      // Ignored while a file is being prepared or another session is open: no silent replacement.
      if (!photo || !size || state.intake === 'preparing' || state.editing) return state
      return { ...state, editing: { id: photo.id, draft: photo.edit ?? initialEdit(size), isNew: false } }
    }

    case 'draftChanged':
      return state.editing ? { ...state, editing: { ...state.editing, draft: action.draft } } : state

    case 'editCommitted': {
      const session = state.editing
      if (!session) return state
      const photos = state.photos.map((p) => {
        const size = p.id === session.id ? workingSize(p.source) : undefined
        if (!size) return p
        return {
          ...p,
          edit: isFull(session.draft, size) ? null : session.draft,
          revision: p.revision + 1,
          output: { status: 'pending' as const },
        }
      })
      return { ...state, photos, editing: null }
    }

    case 'editCancelled': {
      const session = state.editing
      if (!session) return state
      const photos = session.isNew ? state.photos.filter((p) => p.id !== session.id) : state.photos
      return { ...state, photos, editing: null }
    }

    case 'removed':
      return {
        ...state,
        photos: state.photos.filter((p) => p.id !== action.id),
        editing: state.editing?.id === action.id ? null : state.editing,
      }

    case 'moved':
      return state.editing ? state : { ...state, photos: moveItem(state.photos, action.from, action.to) }

    case 'rendered':
      return answerRender(state, action.id, action.revision, {
        status: 'ready',
        blob: action.out.blob,
        width: action.out.width,
        height: action.out.height,
        type: action.out.type,
      })

    case 'renderFailed':
      return answerRender(state, action.id, action.revision, { status: 'failed', problem: action.problem })

    case 'problemSet':
      return { ...state, problem: action.problem }

    case 'problemCleared':
      return { ...state, problem: null }
  }
}

export function isSmallPhoto(size: Size): boolean {
  return Math.max(size.width, size.height) < SMALL_PHOTO_SIDE
}

export function canAdd(state: PhotoPagesState): boolean {
  return !state.editing && roomFor(state) > 0
}

export function count(state: PhotoPagesState): number {
  return state.photos.length
}

export function nextToIntake(state: PhotoPagesState): File | undefined {
  if (state.editing || state.intake !== 'idle') return undefined
  return state.queue[0]
}

export function nextToRender(state: PhotoPagesState): Photo | undefined {
  return state.photos.find((p) => p.source.kind === 'image' && p.output.status === 'pending' && state.editing?.id !== p.id)
}

export function readyToSend(state: PhotoPagesState): boolean {
  return state.photos.length > 0 && blockReason(state) === null
}

export function blockReason(state: PhotoPagesState): BlockReason {
  if (state.editing) return 'editing'
  if (state.intake === 'preparing' || state.queue.length > 0 || state.photos.some((p) => p.output.status === 'pending')) return 'preparing'
  const failed = state.photos.find((p) => p.output.status === 'failed')
  return failed ? { failed: failed.id } : null
}

/** `dataUrls`: the data URL of each photo's blob (a `ready` image output, an `as-is` blob), by photo id; links need none. */
export function toReadInput(state: PhotoPagesState, dataUrls: Readonly<Record<PhotoId, string>>): { kind: 'photo'; photos: RawImage[] } {
  const photos = state.photos.map((p): RawImage => {
    if (p.source.kind === 'link') return { kind: 'url', url: p.source.url }
    if (p.output.status !== 'ready') throw new Error(`photoPages.toReadInput: photo ${p.id} is not ready`)
    const dataUrl = dataUrls[p.id]
    if (dataUrl === undefined) throw new Error(`photoPages.toReadInput: photo ${p.id} has no data URL`)
    if (p.source.kind === 'as-is') {
      return { kind: 'blob', blob: p.source.blob, dataUrl, width: 0, height: 0, type: p.source.type, origin: 'file' }
    }
    return {
      kind: 'blob',
      blob: p.output.blob,
      dataUrl,
      width: p.output.width,
      height: p.output.height,
      type: p.output.type,
      origin: p.source.origin,
    }
  })
  return { kind: 'photo', photos }
}

export function photoNumber(state: PhotoPagesState, id: PhotoId): number {
  return state.photos.findIndex((p) => p.id === id) + 1
}

export function draftOutputSize(state: PhotoPagesState): Size | undefined {
  return state.editing ? outputSize(state.editing.draft.crop, READ_MAX_SIDE) : undefined
}
