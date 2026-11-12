// PhotoSources: where photos come from (docs/dev/design/photo-read.md section 5; decision 1: the phone's own camera app, no live view).
import { useEffect, useId, useRef, type ReactNode, type Ref } from 'react'
import { Button, FileDrop, ImageFileInput, type ImageFileInputHandle, type ImageOrigin } from '../../../ui'
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
  const capture = useRef<ImageFileInputHandle>(null)
  const library = useRef<ImageFileInputHandle>(null)
  const limitId = useId()
  const off = disabled || !canAdd
  const describedBy = canAdd ? undefined : limitId

  useEffect(() => {
    if (!openCamera) return
    capture.current?.open()
    onCameraOpened?.()
  }, [openCamera, onCameraOpened])

  return (
    <div className="photo-sources" ref={rootRef}>
      {options.showTakePhoto ? (
        <div className="photo-sources__buttons">
          <Button variant="primary" icon="camera" disabled={off} aria-describedby={describedBy} onClick={() => capture.current?.open()}>
            {t.takePhoto}
          </Button>
          <Button variant="secondary" icon="photos" disabled={off} aria-describedby={describedBy} onClick={() => library.current?.open()}>
            {t.choosePhotos}
          </Button>
          <ImageFileInput ref={capture} capture disabled={off} onFiles={(files) => onFiles(files, 'camera')} />
          <ImageFileInput ref={library} multiple accept={options.libraryAccept} disabled={off} onFiles={(files) => onFiles(files, 'file')} />
        </div>
      ) : (
        <FileDrop
          label={t.group}
          helper={options.pasteAndDrop ? t.pasteOrDrop : undefined}
          buttonLabel={t.chooseFiles}
          accept={options.libraryAccept}
          multiple
          disabled={off}
          aria-describedby={describedBy}
          onFiles={(files) => onFiles(files, 'file')}
          onReject={(files) => onFiles(files, 'file')}
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
