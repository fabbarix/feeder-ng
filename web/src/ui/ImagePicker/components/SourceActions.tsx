import { Button } from '../../Button'
import type { ImageSource } from '../types'
import { imagePickerStrings as t } from '../strings'

export interface SourceActionsProps {
  sources: readonly ImageSource[]
  /** The camera button exists (viewfinder or camera app). */
  camera: boolean
  /** The camera was refused: offer the camera app too. */
  cameraFallback: boolean
  disabled?: boolean
  onPasteImage: () => void
  onPasteLink: () => void
  onTakePhoto: () => void
  onCameraApp: () => void
}

/** Paste image / Paste link / Take photo (and Use the camera app after a camera failure): 44 px buttons with icons. */
export function SourceActions({ sources, camera, cameraFallback, disabled, onPasteImage, onPasteLink, onTakePhoto, onCameraApp }: SourceActionsProps) {
  const buttons = [
    sources.includes('paste') ? (
      <Button key="paste" variant="secondary" icon="clipboard" disabled={disabled} data-picker-action="paste" onClick={onPasteImage}>
        {t.pasteImage}
      </Button>
    ) : null,
    sources.includes('link') ? (
      <Button key="link" variant="secondary" icon="link" disabled={disabled} data-picker-action="link" onClick={onPasteLink}>
        {t.pasteLink}
      </Button>
    ) : null,
    camera ? (
      <Button key="camera" variant="secondary" icon="camera" disabled={disabled} data-picker-action="camera" onClick={onTakePhoto}>
        {t.takePhoto}
      </Button>
    ) : null,
    camera && cameraFallback ? (
      <Button key="app" variant="secondary" disabled={disabled} data-picker-action="camera-app" onClick={onCameraApp}>
        {t.useCameraApp}
      </Button>
    ) : null,
  ].filter(Boolean)
  return buttons.length > 0 ? <div className="image-picker__sources">{buttons}</div> : null
}
