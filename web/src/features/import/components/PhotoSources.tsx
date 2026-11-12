// PhotoSources: where photos come from (docs/dev/design/photo-read.md section 5; decision 1: the phone's own camera app, no live view).
import { useEffect, useId, useRef, type ReactNode, type Ref } from 'react'
import { Button, FileDrop, type ImageOrigin } from '../../../ui'
import type { PhotoSourceOptions } from '../hooks/usePhotoSources'
import { photoReadStrings as t } from '../strings'

export interface PhotoSourcesProps {
  options: PhotoSourceOptions
  /** false at 4 photos (or while a file is prepared): every source is off, with the reason as description. */
  canAdd: boolean
  disabled?: boolean
  /** 'camera' from the capture input, 'file' from the library / files input and the drop zone. */
  onFiles: (files: File[], origin: ImageOrigin) => void
  /** The sources' wrapper, for the owner to focus into. */
  rootRef?: Ref<HTMLDivElement>
  /** Opens the system camera once, when this turns true (Retake). */
  openCamera?: boolean
  onCameraOpened?: () => void
}

/** Take photo and Choose photos on a phone (hidden inputs behind them); Choose files, drop and paste on a computer. */
export function PhotoSources({ options, canAdd, disabled, onFiles, rootRef, openCamera, onCameraOpened }: PhotoSourcesProps): ReactNode {
  const capture = useRef<HTMLInputElement>(null)
  const library = useRef<HTMLInputElement>(null)
  const limitId = useId()
  const off = disabled || !canAdd
  const describedBy = canAdd ? undefined : limitId

  useEffect(() => {
    if (!openCamera) return
    capture.current?.click()
    onCameraOpened?.()
  }, [openCamera, onCameraOpened])

  return (
    <div className="photo-sources" ref={rootRef}>
      {options.showTakePhoto ? (
        <div className="photo-sources__buttons">
          <Button variant="primary" icon="camera" disabled={off} aria-describedby={describedBy} onClick={() => capture.current?.click()}>
            {t.takePhoto}
          </Button>
          <Button variant="secondary" icon="photos" disabled={off} aria-describedby={describedBy} onClick={() => library.current?.click()}>
            {t.choosePhotos}
          </Button>
          <input
            ref={capture}
            type="file"
            hidden
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const files = Array.from(e.currentTarget.files ?? [])
              e.currentTarget.value = ''
              if (files.length > 0) onFiles(files, 'camera')
            }}
          />
          <input
            ref={library}
            type="file"
            hidden
            accept={options.libraryAccept}
            multiple
            onChange={(e) => {
              const files = Array.from(e.currentTarget.files ?? [])
              e.currentTarget.value = ''
              if (files.length > 0) onFiles(files, 'file')
            }}
          />
        </div>
      ) : (
        <FileDrop
          label={t.group}
          helper={options.pasteAndDrop ? t.pasteOrDrop : undefined}
          buttonLabel={t.chooseFiles}
          accept={options.libraryAccept}
          multiple
          disabled={off}
          onFiles={(files) => onFiles(files, 'file')}
        />
      )}
      {canAdd ? null : (
        <p id={limitId} className="photo-sources__limit">
          {t.limitReached}
        </p>
      )}
    </div>
  )
}
