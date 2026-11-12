// The state owner of the Photo tab (docs/dev/design/photo-read.md section 4.1; photo-store.md phase 2). The reducer and selectors are in
// lib/photoPages.ts; this hook runs the work: the intake of each file (one at a time), the render of each photo (one at a time, never during
// an intake), the object URLs, the device store (writes, restore, clearing) and the leaving of the import page.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  AS_IS_MAX_BYTES,
  browserImageEngine,
  blobToDataUrl,
  checkImageFile,
  INPUT_MAX_BYTES,
  INPUT_MAX_PIXELS,
  parseImageLink,
  pickFromClipboardData,
  prepareImage,
  READ_MAX_SIDE,
  readHeaderSize,
  TooManyPixelsError,
  useObjectUrls,
  type ClipboardDataLike,
  type ImageEdit,
  type ImageOrigin,
  type ReadImageEngine,
} from '../../../ui'
import { useMe } from '../../../app/useMe'
import { createPhotoWriter, restorePhotos, type PhotoStore } from '../lib/photoStore'
import { appPhotoStore } from '../lib/photoStoreIdb'
import {
  initialPhotoPages,
  nextToIntake,
  nextToRender,
  photoPagesReducer,
  readyToSend,
  toReadInput as buildReadInput,
  type PanelProblem,
  type Photo,
  type PhotoId,
  type PhotoPagesState,
} from '../lib/photoPages'
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

/** The HEIC or HEIF type a file declares: its own type, or by its name when the type is empty (Chrome and Windows often leave it empty). */
function declaredHeic(file: File): 'image/heic' | 'image/heif' | null {
  const type = file.type.toLowerCase()
  if (type === 'image/heic' || type === 'image/heif') return type
  if (type !== '') return null
  const ext = /\.(heic|heif)$/i.exec(file.name)?.[1]?.toLowerCase()
  return ext === 'heic' ? 'image/heic' : ext === 'heif' ? 'image/heif' : null
}

/** The code of an error from the render (ImageEditorError carries `code`), or undefined. */
function codeOf(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : undefined
}

export function usePhotoPages(deps: Partial<PhotoPagesDeps> = {}): UsePhotoPages {
  const engine = deps.engine ?? browserImageEngine
  const store = useMemo(() => deps.store ?? appPhotoStore(), [deps.store])
  const urls = useObjectUrls(deps.objectUrls)
  const userId = useMe().data?.id

  const [state, dispatch] = useReducer(photoPagesReducer, undefined, initialPhotoPages)
  const latest = useRef(state)
  latest.current = state
  const [restoredIds, setRestoredIds] = useState<readonly PhotoId[]>([])
  const [rendering, setRendering] = useState(false)

  const mounted = useRef(false)
  const origins = useRef(new WeakMap<File, ImageOrigin>())
  const intaking = useRef(false)
  const renderingNow = useRef(false)
  const restoring = useRef(false)

  // userId 0 is a placeholder until the signed-in User is known: a writer does nothing before start(), which only the restore calls.
  const writer = useMemo(() => createPhotoWriter(store, userId ?? 0), [store, userId])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // ---- restore: once, when the User is known ----------------------------------------------------------------------------------
  useEffect(() => {
    if (userId === undefined || restoring.current) return
    restoring.current = true
    void (async () => {
      let records: unknown[] = []
      try {
        records = await store.load()
      } catch {
        records = [] // a store that cannot be read restores nothing
      }
      const found = restorePhotos(records, userId)
      if (found.otherUser) writer.clear()
      if (!mounted.current) return
      const photos = found.otherUser ? [] : found.photos
      writer.start(photos)
      if (photos.length > 0) {
        dispatch({ type: 'restored', photos, nextId: found.nextId })
        setRestoredIds(photos.map((p) => p.id))
      } else {
        writer.persist(latest.current.photos) // nothing came back: the photos added while the load ran are saved now
      }
    })()
  }, [store, userId, writer])

  // ---- writes: the list is persisted whenever it changes (the writer writes only what changed) -------------------------------
  useEffect(() => {
    writer.persist(state.photos)
  }, [state.photos, writer])

  // ---- leaving the import page clears the store ---------------------------------------------------------------------------------
  // In the app (a browser-history data router) the address has already moved when this screen unmounts, so a changed address at cleanup
  // means the User left. A plain unmount, StrictMode's mount-unmount-mount and a reload (no cleanup at all) keep the photos.
  useEffect(() => {
    const address = window.location.pathname
    return () => {
      if (window.location.pathname !== address) writer.clear()
    }
  }, [writer])

  // ---- intake: one file at a time, never while an editor is open ----------------------------------------------------------------
  const refuse = (problem: PanelProblem) => dispatch({ type: 'problemSet', problem })

  const intake = async (file: File): Promise<void> => {
    const origin = origins.current.get(file) ?? 'file'
    const declared = declaredHeic(file)
    const refusal = checkImageFile(file, INPUT_MAX_BYTES)
    if (refusal === 'too_large') return refuse({ code: 'too_large', limit: 'original' })
    if (refusal) return refuse({ code: refusal })
    let head: Uint8Array = new Uint8Array(0)
    try {
      head = await engine.readHead(file)
    } catch {
      // no header: the decode checks the size instead
    }
    if (!mounted.current) return
    const size = readHeaderSize(head)
    if (size && size.width * size.height > INPUT_MAX_PIXELS) return refuse({ code: 'too_many_pixels' })
    let working
    try {
      working = await engine.normalise(file, { maxPixels: INPUT_MAX_PIXELS })
    } catch (err) {
      if (!mounted.current) return
      if (err instanceof TooManyPixelsError) return refuse({ code: 'too_many_pixels' })
      if (declared === null) return refuse({ code: 'unreadable' })
      // A HEIC this browser cannot show is kept as it is (D8), within the server's per-photo limit.
      if (file.size > AS_IS_MAX_BYTES) return refuse({ code: 'too_large', limit: 'as-is' })
      return dispatch({ type: 'added', source: { kind: 'as-is', blob: file, type: declared, name: file.name } })
    }
    if (!mounted.current) return
    dispatch({ type: 'added', source: { kind: 'image', working: working.blob, width: working.width, height: working.height, origin } })
  }

  useEffect(() => {
    if (intaking.current) return
    const file = nextToIntake(state)
    if (!file) return
    intaking.current = true
    dispatch({ type: 'intakeStarted' })
    void intake(file).finally(() => {
      intaking.current = false
      if (mounted.current) dispatch({ type: 'intakeEnded' })
    })
  })

  // ---- render: one photo at a time, after the intakes ---------------------------------------------------------------------------
  useEffect(() => {
    if (renderingNow.current || intaking.current || state.intake === 'preparing') return
    const photo = nextToRender(state)
    if (!photo || photo.source.kind !== 'image') return
    const { id, revision, edit } = photo
    const working = photo.source.working
    renderingNow.current = true
    setRendering(true)
    void (async () => {
      try {
        const out = await prepareImage(
          working,
          { maxSide: READ_MAX_SIDE, maxBytes: AS_IS_MAX_BYTES, turns: edit?.turns ?? 0, ...(edit ? { crop: edit.crop } : {}) },
          engine,
        )
        if (mounted.current) dispatch({ type: 'rendered', id, revision, out: { blob: out.blob, width: out.width, height: out.height, type: out.type } })
      } catch (err) {
        if (mounted.current) dispatch({ type: 'renderFailed', id, revision, problem: codeOf(err) === 'too_large' ? 'too_large' : 'render_failed' })
      } finally {
        renderingNow.current = false
        if (mounted.current) setRendering(false)
      }
    })()
  })

  // ---- object URLs ---------------------------------------------------------------------------------------------------------------
  const previewUrl = useCallback(
    (id: PhotoId): string | undefined => {
      const photo = latest.current.photos.find((p) => p.id === id)
      if (!photo || photo.source.kind !== 'image') return undefined
      if (photo.output.status === 'ready') return urls.urlFor(`${id}:out`, photo.output.blob)
      return urls.urlFor(`${id}:work`, photo.source.working)
    },
    [urls],
  )
  const editing = state.editing ? state.photos.find((p) => p.id === state.editing?.id) : undefined
  const editorUrl = editing && editing.source.kind === 'image' ? urls.urlFor(`${editing.id}:work`, editing.source.working) : undefined
  const forget = useCallback(
    (id: PhotoId) => {
      urls.release(`${id}:work`)
      urls.release(`${id}:out`)
    },
    [urls],
  )

  // ---- sources ---------------------------------------------------------------------------------------------------------------------
  const addFiles = useCallback((files: File[], origin: ImageOrigin) => {
    if (files.length === 0) return
    for (const file of files) origins.current.set(file, origin)
    dispatch({ type: 'queued', files })
  }, [])

  const addLink = useCallback(
    (text: string) => {
      const parsed = parseImageLink(text)
      if (!parsed.ok) return dispatch({ type: 'problemSet', problem: { code: parsed.code } })
      if (parsed.kind === 'https') return dispatch({ type: 'added', source: { kind: 'link', url: parsed.url } })
      addFiles([new File([parsed.blob], 'pasted-image', { type: parsed.blob.type })], 'paste')
    },
    [addFiles],
  )

  const onPaste = useCallback(
    (data: ClipboardDataLike | null) => {
      const pick = pickFromClipboardData(data)
      if (pick.kind === 'file') return addFiles([pick.file], 'paste')
      if (pick.kind === 'link') return addLink(pick.url)
      const text = data?.getData?.('text/plain') ?? ''
      if (text.trim() !== '') addLink(text)
    },
    [addFiles, addLink],
  )

  // ---- editing ---------------------------------------------------------------------------------------------------------------------
  const edit = useCallback((id: PhotoId) => dispatch({ type: 'editStarted', id }), [])
  const setDraft = useCallback((draft: ImageEdit) => dispatch({ type: 'draftChanged', draft }), [])
  const commit = useCallback(() => dispatch({ type: 'editCommitted' }), [])
  const cancel = useCallback(() => {
    const session = latest.current.editing
    if (session?.isNew) forget(session.id)
    dispatch({ type: 'editCancelled' })
  }, [forget])
  const remove = useCallback(
    (id: PhotoId) => {
      forget(id)
      dispatch({ type: 'removed', id })
    },
    [forget],
  )
  const move = useCallback((from: number, to: number) => dispatch({ type: 'moved', from, to }), [])
  const dismissProblem = useCallback(() => dispatch({ type: 'problemCleared' }), [])

  // ---- clearing: the read finished, or the restore message's Remove --------------------------------------------------------------
  const clearAll = useCallback(() => {
    writer.clear()
    urls.releaseAll()
    setRestoredIds([])
    for (const photo of latest.current.photos) dispatch({ type: 'removed', id: photo.id })
  }, [urls, writer])

  // ---- the read ---------------------------------------------------------------------------------------------------------------------
  const toReadInput = useCallback(async (): Promise<Extract<ReadInput, { kind: 'photo' }>> => {
    const current = latest.current
    const dataUrls: Record<PhotoId, string> = {}
    for (const photo of current.photos) {
      const blob = photoBlob(photo)
      if (blob) dataUrls[photo.id] = await blobToDataUrl(blob)
    }
    return buildReadInput(current, dataUrls) as Extract<ReadInput, { kind: 'photo' }>
  }, [])

  const busy = state.intake === 'preparing' || rendering
  const restoredCount = state.photos.filter((p) => restoredIds.includes(p.id)).length

  return {
    state,
    previewUrl,
    editorUrl,
    addFiles,
    addLink,
    onPaste,
    edit,
    setDraft,
    commit,
    cancel,
    remove,
    move,
    dismissProblem,
    busy,
    canRead: readyToSend(state),
    toReadInput,
    restoredCount,
    removeRestored: clearAll,
    finished: clearAll,
  }
}

/** The Blob whose data URL the request carries: an as-is HEIC with its DECLARED type, a rendered output; none for a link. */
function photoBlob(photo: Photo): Blob | undefined {
  if (photo.source.kind === 'link') return undefined
  if (photo.source.kind === 'as-is') return new Blob([photo.source.blob], { type: photo.source.type })
  return photo.output.status === 'ready' ? photo.output.blob : undefined
}
