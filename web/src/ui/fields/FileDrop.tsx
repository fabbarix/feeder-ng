import { useRef, useState, type DragEvent } from 'react'
import { Icon } from '../Icon'
import { FieldFrame, useFieldIds } from './FieldFrame'
import type { FieldProps } from './Field'
import { acceptsFile } from './accept'
import { fieldStrings } from './strings'
import './Field.css'
import './FileDrop.css'

export interface FileDropProps extends Omit<FieldProps, 'name' | 'required'> {
  /** An accept string: ".json,image/*". */
  accept?: string
  multiple?: boolean
  /** The button's text and accessible name; default "Choose a file or drop it here". */
  buttonLabel?: string
  /** The chosen file's name, shown under the zone. */
  fileName?: string
  /** Accepted files (only the first unless `multiple`). */
  onFiles: (files: File[]) => void
  /** Files that do not match `accept`. */
  onReject?: (files: File[]) => void
  /** The button's description (a host says why choosing is off); the button has no description of its own otherwise. */
  'aria-describedby'?: string
}

/** A dashed drop zone with a "Choose a file or drop it here" button. The native file input stays inside this primitive. */
export function FileDrop({ label, helper, error, disabled, accept, multiple, fileName, buttonLabel, onFiles, onReject, 'aria-describedby': describedBy }: FileDropProps) {
  const ids = useFieldIds()
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const distribute = (files: File[]) => {
    const accepted = files.filter((f) => acceptsFile(f, accept))
    const rejected = files.filter((f) => !acceptsFile(f, accept))
    if (rejected.length > 0) onReject?.(rejected)
    const chosen = multiple ? accepted : accepted.slice(0, 1)
    if (chosen.length > 0) onFiles(chosen)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    distribute(Array.from(e.dataTransfer?.files ?? []))
  }

  return (
    <FieldFrame ids={ids} label={label} helper={helper} error={error}>
      <div
        data-testid="file-drop-zone"
        className="file-drop"
        data-dragging={dragging || undefined}
        data-disabled={disabled || undefined}
        onDragEnter={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Icon name="file" size={24} />
        <button type="button" className="file-drop__button" disabled={disabled} aria-describedby={describedBy} onClick={() => input.current?.click()}>
          {buttonLabel ?? fieldStrings.chooseFile}
        </button>
        {fileName ? <p className="file-drop__name">{fileName}</p> : null}
        <input
          ref={input}
          type="file"
          hidden
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => {
            distribute(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
      </div>
    </FieldFrame>
  )
}
