import { useRef } from 'react'
import { ImageFileInput, type ImageFileInputHandle } from './ImageFileInput'
import { Button } from '../../Button'
import { acceptsFile } from '../../fields/accept'
import { Thumb } from '../../Thumb'
import { ACCEPT } from '../lib/limits'
import { imagePickerStrings as t } from '../strings'

export interface CompactBodyProps {
  label: string
  /** The name the empty Thumb takes its monogram from. */
  monogram: string
  hasValue: boolean
  previewSrc: string
  /** Shown beside the empty Thumb; default "No Picture yet.". */
  helper?: string
  helperId: string
  camera: boolean
  disabled: boolean
  onFiles: (files: File[]) => void
  onReject: (files: File[]) => void
  onTakePhoto: () => void
  onRemove: () => void
  /** B9-37: the buttons' names when the picker repeats down a list (compactActionNames); the visible words are unchanged. */
  names?: { choose: string; take: string; change: string; remove: string }
}

/**
 * B9-30 (SET-04, SET-05): the compact picker of an entity page's last tile. Empty: the 72 px monogram, "No Picture yet." and outline
 * small "Choose a file" (and "Take photo" where a camera route exists). Filled: the 72 px picture with "Change" and "Remove".
 */
export function CompactBody({ label, monogram, hasValue, previewSrc, helper, helperId, camera, disabled, onFiles, onReject, onTakePhoto, onRemove, names }: CompactBodyProps) {
  const input = useRef<ImageFileInputHandle>(null)
  const choose = () => input.current?.open()
  return (
    <div className="image-picker__compact">
      <Thumb name={monogram} imageUrl={hasValue ? previewSrc : undefined} size={72} label={hasValue ? label : undefined} />
      <div className="image-picker__compact-text">
        {hasValue ? null : (
          <p id={helperId} className="image-picker__helper">
            {helper ?? t.noPictureYet}
          </p>
        )}
        <div className="image-picker__compact-actions">
          {hasValue ? (
            <>
              <Button variant="secondary" size="sm" disabled={disabled} onClick={choose} aria-label={names?.change}>
                {t.change}
              </Button>
              <Button variant="secondary" size="sm" disabled={disabled} onClick={onRemove} aria-label={names?.remove}>
                {t.remove}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" icon="photos" disabled={disabled} onClick={choose} aria-label={names?.choose}>
                {t.chooseFile}
              </Button>
              {camera ? (
                <Button variant="secondary" size="sm" disabled={disabled} data-picker-action="camera" onClick={onTakePhoto} aria-label={names?.take}>
                  {t.takePhoto}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
      <ImageFileInput
        ref={input}
        accept={ACCEPT}
        disabled={disabled}
        onFiles={(files) => {
          const rejected = files.filter((f) => !acceptsFile(f, ACCEPT))
          if (rejected.length > 0) onReject(rejected)
          const accepted = files.filter((f) => acceptsFile(f, ACCEPT)).slice(0, 1)
          if (accepted.length > 0) onFiles(accepted)
        }}
      />
    </div>
  )
}
