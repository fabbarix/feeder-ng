import { useId } from 'react'
import { Button } from '../Button'
import { FileDrop } from '../fields/FileDrop'
import { Icon } from '../Icon'
import { IconButton } from '../IconButton'
import { CameraPanel } from './components/CameraPanel'
import { CropEditor } from './components/CropEditor'
import { FileButton } from './components/FileButton'
import { LinkPanel } from './components/LinkPanel'
import { PreviewPane } from './components/PreviewPane'
import { SourceActions } from './components/SourceActions'
import { useImagePicker } from './hooks/useImagePicker'
import { ACCEPT } from './lib/limits'
import { imagePickerStrings as t, limitHelperFor } from './strings'
import type { ImagePickerProps } from './types'
import './ImagePicker.css'

const PHASE_TEXT = { preparing: t.preparing, uploading: t.uploading, downloading: t.downloading, idle: '' } as const

/**
 * The one image component for every image field (docs/dev/design/ip1-imagepicker.md): file / drop (FileDrop), paste (event and button),
 * link (the server downloads it), camera (viewfinder, with the camera app as fallback); preview, rotate, crop, replace, remove.
 * Upload mode keeps an image id; raw mode hands back a downscaled Blob (Recipe Assistant). Markup only: the work is in useImagePicker.
 */
export function ImagePicker(props: ImagePickerProps) {
  const p = useImagePicker(props)
  const headingId = useId()
  const helperId = useId()
  const errorId = useId()
  const size = props.size ?? 'hero'
  const helper = props.helper ?? limitHelperFor(p.maxBytes)
  const editing = p.cropSession.phase === 'ready'
  const statusText = p.loadingCrop ? t.cropLoading : PHASE_TEXT[p.phase]
  const fieldOnly = p.linkPanelOpen // the link problem is shown on its field, the alert below is then only for screen readers

  return (
    <div
      ref={p.groupRef}
      role="group"
      className="image-picker"
      aria-labelledby={headingId}
      aria-describedby={[helperId, p.message ? errorId : null].filter(Boolean).join(' ')}
      aria-keyshortcuts="Control+V Meta+V"
      aria-busy={p.busy || undefined}
      onPaste={p.handlePaste}
      onKeyDown={p.onKeyDown}
    >
      <p id={headingId} className="image-picker__heading">
        {props.label}
      </p>

      {editing && p.cropSession.phase === 'ready' ? (
        <CropEditor
          src={p.cropSession.src}
          width={p.cropSession.width}
          height={p.cropSession.height}
          aspect={p.aspect}
          maxSide={p.raw ? p.maxSide : p.uploadMaxSide}
          busy={p.busy}
          autoFocus
          onApply={p.applyCrop}
          onCancel={p.closeCrop}
        />
      ) : (
        <>
          {p.hasValue ? <PreviewPane src={p.previewSrc} label={props.label} size={size} /> : null}
          {p.hasValue ? (
            <div className="image-picker__actions">
              {p.canTransform ? (
                <>
                  <IconButton icon="rotateLeft" label={t.rotateLeft} disabled={p.locked} onClick={() => void p.rotate(-1)} />
                  <IconButton icon="rotateRight" label={t.rotateRight} disabled={p.locked} onClick={() => void p.rotate(1)} />
                </>
              ) : null}
              {p.cropEnabled ? (
                <Button variant="secondary" disabled={p.locked} data-picker-action="crop" onClick={p.openCrop}>
                  {t.crop}
                </Button>
              ) : null}
              <Button variant="tertiary" icon="delete" disabled={p.locked} onClick={p.remove}>
                {t.removeImage}
              </Button>
            </div>
          ) : null}

          {p.sources.includes('file') ? (
            <div onDropCapture={() => (p.dropped.current = true)}>
              <FileDrop
                label={p.hasValue ? t.replaceImage : t.addImage}
                buttonLabel={p.hasValue ? `${t.replaceImage}: choose a file or drop it here` : undefined}
                accept={ACCEPT}
                disabled={p.locked}
                onFiles={p.onFiles}
                onReject={p.onReject}
              />
            </div>
          ) : null}

          <SourceActions
            sources={p.sources}
            camera={p.cameraButton}
            cameraFallback={p.cameraFallback}
            disabled={p.locked}
            onPasteImage={() => void p.pasteImage()}
            onPasteLink={p.openLink}
            onTakePhoto={p.takePhoto}
            onCameraApp={p.cameraApp}
          />
          <p id={helperId} className="image-picker__helper">
            {helper}
          </p>

          {p.panel === 'link' ? (
            <LinkPanel error={p.message || undefined} busy={p.locked} onSubmit={p.submitLink} onCancel={p.closeLink} />
          ) : null}
          {p.panel === 'camera' ? <CameraPanel camera={p.camera} disabled={p.busy} onCapture={() => void p.capture()} onClose={p.closeCamera} /> : null}
        </>
      )}

      {statusText ? (
        <div role="status" aria-live="polite" className="image-picker__status">
          <span>{statusText}</span>
          {!p.loadingCrop ? (
            <Button variant="tertiary" size="sm" onClick={p.cancel}>
              {t.cancel}
            </Button>
          ) : null}
        </div>
      ) : null}

      {p.message ? (
        <p id={errorId} role="alert" className={fieldOnly ? 'visually-hidden' : 'image-picker__error'}>
          {fieldOnly ? null : <Icon name="error" size={14} />}
          <span>{p.message}</span>
        </p>
      ) : null}

      {p.cameraButton ? <FileButton ref={p.captureInput} disabled={p.locked} onFile={p.onCameraFile} /> : null}
    </div>
  )
}
