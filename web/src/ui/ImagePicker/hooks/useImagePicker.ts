import { useCallback, useEffect, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type KeyboardEvent } from 'react'
import { CROP_ASPECTS, type CropAspect, type Rect } from '../lib/crop'
import { cameraStrategy } from '../lib/cameraStrategy'
import { pickFromClipboardData, readClipboard, type ClipboardDataLike, type ClipboardPick } from '../lib/clipboard'
import { cameraEnvironment, resolveDeps } from '../lib/deps'
import { MAX_UPLOAD_BYTES, RAW_MAX_SIDE, UPLOAD_MAX_SIDE } from '../lib/limits'
import { problemFromError, problemMessage } from '../lib/problems'
import type { FileButtonHandle } from '../components/FileButton'
import type { ImageOrigin, ImageSource, RawImage } from '../types'
import type { ImagePickerProps } from '../types'
import { useAfter } from './useAfter'
import { useCameraCapture } from './useCameraCapture'
import { useCropSession } from './useCropSession'
import { useImageIngest } from './useImageIngest'
import { usePreviewUrl } from './usePreviewUrl'
import { useRawIngest } from './useRawIngest'

/** How long preparing a picture may take before the status line says so. */
const PREPARING_DELAY_MS = 250

const ALL_SOURCES: readonly ImageSource[] = ['file', 'paste', 'link', 'camera']

type Panel = 'none' | 'link' | 'camera'
type FocusTarget = 'link' | 'camera' | 'crop' | 'file'

const FOCUS_SELECTOR: Record<FocusTarget, string> = {
  link: '[data-picker-action="link"]',
  camera: '[data-picker-action="camera"]',
  crop: '[data-picker-action="crop"]',
  file: '.file-drop__button',
}

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable)

/** Everything the ImagePicker component shows and does: orchestrates the pick pipelines, panels, camera, crop and the focus. No markup. */
export function useImagePicker(props: ImagePickerProps) {
  const raw = props.mode === 'raw' ? props : null
  const deps = resolveDeps(props.deps)
  const depsRef = useRef(deps)
  depsRef.current = deps
  const propsRef = useRef(props)
  propsRef.current = props

  const groupRef = useRef<HTMLDivElement>(null)
  const captureInput = useRef<FileButtonHandle>(null)
  const dropped = useRef(false)
  const [panel, setPanel] = useState<Panel>('none')
  const [cameraFallback, setCameraFallback] = useState(false)
  const [loading, setLoading] = useState(false)
  const [restore, setRestore] = useState<FocusTarget | null>(null)

  const maxBytes = raw?.maxBytes ?? MAX_UPLOAD_BYTES
  const aspect: CropAspect = props.aspect ?? (raw ? CROP_ASPECTS.free : CROP_ASPECTS.landscape)
  const panelRef = useRef(panel)
  panelRef.current = panel

  // ---- the two pick pipelines (only one is used, by mode) ----
  const cropSession = useCropSession(deps, () => pipelineRef.current?.setProblem('crop_unavailable'))
  const cropPhaseRef = useRef(cropSession.session.phase)
  cropPhaseRef.current = cropSession.session.phase

  /** Closes what the finished pick came from (link panel, crop editor) and hands focus back to its button. */
  const finishPick = useCallback(() => {
    if (cropPhaseRef.current !== 'closed') {
      cropSession.close()
      setRestore('crop')
    } else if (panelRef.current === 'link') {
      setRestore('link')
    }
    setPanel((p) => (p === 'link' ? 'none' : p))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cropSession.close is stable
  }, [])

  const upload = useImageIngest({
    api: deps.api,
    engine: deps.engine,
    onStored: (id) => {
      const previous = propsRef.current.value
      // Only what this picker uploaded is deleted; an id that came from the host belongs to its saved entity.
      if (typeof previous === 'string' && previous && previous !== id) upload.discardOwned(previous)
      finishPick()
      ;(propsRef.current as { onChange: (id: string) => void }).onChange(id)
    },
  })
  const rawIngest = useRawIngest({
    engine: deps.engine,
    maxSide: raw?.maxSide ?? RAW_MAX_SIDE,
    maxBytes,
    output: raw?.output,
    onResult: (image) => {
      finishPick()
      ;(propsRef.current as { onChange: (image: RawImage | null) => void }).onChange(image)
    },
  })
  const pipeline = raw ? rawIngest : upload
  const pipelineRef = useRef(pipeline)
  pipelineRef.current = pipeline

  // "Preparing" is usually instant: its status line only appears when it takes noticeable time.
  const showPreparing = useAfter(pipeline.phase === 'preparing', PREPARING_DELAY_MS)
  const statusPhase = pipeline.phase === 'preparing' && !showPreparing ? 'idle' : pipeline.phase

  const busy = pipeline.busy || loading || cropSession.session.phase === 'loading'
  const locked = busy || Boolean(props.disabled)

  // PE: tell the host while the picker works (same moments as aria-busy); the cleanup also reports false on unmount, so a host never stays locked.
  useEffect(() => {
    if (!busy) return undefined
    propsRef.current.onBusyChange?.(true)
    return () => propsRef.current.onBusyChange?.(false)
  }, [busy])

  // ---- what is held ----
  const value = props.value
  const hasValue = raw ? raw.value !== null : typeof value === 'string' && value !== ''
  const canTransform = hasValue && (!raw || raw.value?.kind === 'blob')
  const previewSrc = usePreviewUrl((value as string | RawImage | null) || null, deps.objectUrls)

  // ---- sources ----
  const sources = props.sources ?? ALL_SOURCES
  const baseStrategy = sources.includes('camera') ? cameraStrategy(cameraEnvironment(deps.mediaDevices)) : 'none'
  const strategy = cameraFallback && baseStrategy !== 'none' ? 'capture-input' : baseStrategy
  const camera = useCameraCapture({ enabled: panel === 'camera', mediaDevices: deps.mediaDevices, grabFrame: deps.grabFrame })

  useEffect(() => {
    if (panel === 'camera' && camera.needsFallback) {
      setPanel('none')
      setCameraFallback(true)
      pipelineRef.current.setProblem('camera_failed')
    }
  }, [panel, camera.needsFallback])

  // ---- focus ----
  useEffect(() => {
    if (!restore || locked) return
    groupRef.current?.querySelector<HTMLElement>(FOCUS_SELECTOR[restore])?.focus()
    setRestore(null)
  }, [restore, locked])

  // ---- picking ----
  const ingestBlob = (blob: Blob, origin: ImageOrigin) => void pipeline.ingestBlob(blob, origin)

  const onFiles = (files: File[]) => {
    const origin: ImageOrigin = dropped.current ? 'drop' : 'file'
    dropped.current = false
    if (files[0]) ingestBlob(files[0], origin)
  }
  const onReject = () => {
    dropped.current = false
    pipeline.setProblem('unsupported')
  }

  const applyPick = (pick: ClipboardPick, origin: ImageOrigin) => {
    if (pick.kind === 'file') ingestBlob(pick.file, origin)
    else if (pick.kind === 'link') void pipeline.ingestLink(pick.url)
    else pipeline.setProblem('clipboard_empty')
  }

  const pasteImage = async () => {
    pipeline.setProblem(null)
    try {
      applyPick(await readClipboard(deps.clipboard), 'paste')
    } catch (err) {
      pipeline.setProblem(problemFromError(err))
    }
  }

  /** Ctrl+V: from the picker (React) or from the enclosing dialog (native, `listenOn="dialog"`). */
  const handlePaste = (e: { clipboardData: ClipboardDataLike | null; target: EventTarget | null; preventDefault(): void }) => {
    if (locked || isEditable(e.target)) return
    e.preventDefault()
    applyPick(pickFromClipboardData(e.clipboardData), 'paste')
  }
  const handlePasteRef = useRef(handlePaste)
  handlePasteRef.current = handlePaste

  const listenOn = props.listenOn
  useEffect(() => {
    if (listenOn !== 'dialog') return
    const dialog = groupRef.current?.closest('dialog')
    if (!dialog) return
    const onPaste = (e: ClipboardEvent) => {
      if (groupRef.current?.contains(e.target as Node)) return // the picker's own handler has it
      handlePasteRef.current(e)
    }
    dialog.addEventListener('paste', onPaste)
    return () => dialog.removeEventListener('paste', onPaste)
  }, [listenOn])

  // ---- panels ----
  const openLink = () => {
    pipeline.setProblem(null)
    setPanel('link')
  }
  const closeLink = () => {
    pipeline.setProblem(null)
    setPanel('none')
    setRestore('link')
  }
  const takePhoto = () => {
    if (strategy === 'capture-input') return captureInput.current?.open()
    pipeline.setProblem(null)
    setPanel('camera')
  }
  const closeCamera = () => {
    setPanel('none')
    setRestore('camera')
  }
  const capture = async () => {
    const frame = await camera.capture()
    if (!frame) return
    closeCamera()
    ingestBlob(frame, 'camera')
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || panel === 'none') return
    e.preventDefault()
    e.stopPropagation()
    if (panel === 'camera') closeCamera()
    else closeLink()
  }

  // ---- the picture ----
  const remove = () => {
    if (raw) (propsRef.current as { onChange: (image: RawImage | null) => void }).onChange(null)
    else {
      if (typeof value === 'string') upload.discardOwned(value)
      ;(propsRef.current as { onChange: (id: string) => void }).onChange('')
    }
    setRestore('file')
  }

  const rotate = async (delta: 1 | -1) => {
    const turns = delta === 1 ? 1 : 3
    if (raw) {
      if (raw.value?.kind === 'blob') await rawIngest.ingestBlob(raw.value.blob, raw.value.origin, { turns })
      return
    }
    setLoading(true)
    try {
      const blob = await deps.api.loadBlob(`/api/images/${value as string}`)
      const done = upload.ingestBlob(blob, 'file', { turns })
      setLoading(false)
      await done
    } catch {
      setLoading(false)
      upload.setProblem('failed')
    }
  }

  const openCrop = () => {
    pipeline.setProblem(null)
    if (raw) {
      if (raw.value?.kind === 'blob') void cropSession.open({ kind: 'held', blob: raw.value.blob, width: raw.value.width, height: raw.value.height })
    } else void cropSession.open({ kind: 'stored', url: `/api/images/${value as string}` })
  }
  const closeCrop = () => {
    cropSession.close()
    setRestore('crop')
  }
  const applyCrop = (result: { turns: 0 | 1 | 2 | 3; crop: Rect }) => {
    const s = cropSession.session
    if (s.phase !== 'ready') return
    void pipeline.ingestBlob(s.blob, raw?.value?.kind === 'blob' ? raw.value.origin : 'file', result)
  }

  const message = props.error ?? (pipeline.problem ? problemMessage(pipeline.problem, maxBytes) : '')

  return {
    groupRef,
    captureInput,
    dropped,
    deps,
    raw,
    maxBytes,
    maxSide: raw?.maxSide ?? RAW_MAX_SIDE,
    uploadMaxSide: UPLOAD_MAX_SIDE,
    aspect,
    sources,
    hasValue,
    canTransform,
    previewSrc,
    phase: statusPhase,
    busy,
    locked,
    message,
    panel,
    camera,
    cameraButton: strategy !== 'none',
    cameraFallback,
    cropSession: cropSession.session,
    cropEnabled: props.crop !== false && canTransform,
    linkPanelOpen: panel === 'link',
    loadingCrop: cropSession.session.phase === 'loading',
    onFiles,
    onReject,
    pasteImage,
    handlePaste: (e: ReactClipboardEvent) => handlePaste(e),
    openLink,
    closeLink,
    submitLink: (text: string) => void pipeline.ingestLink(text),
    takePhoto,
    cameraApp: () => captureInput.current?.open(),
    capture,
    closeCamera,
    onCameraFile: (file: File) => ingestBlob(file, 'camera'),
    onKeyDown,
    cancel: pipeline.cancel,
    remove,
    rotate,
    openCrop,
    closeCrop,
    applyCrop,
  }
}
