// ImageFileInput: the hidden image file input that hosts with their own buttons open (the photo read's Take photo / Choose photos).
import { forwardRef, useImperativeHandle, useRef, type ChangeEvent } from 'react'

export interface ImageFileInputHandle {
  /** Opens the system file dialog (or, with `capture`, the camera app). */
  open(): void
}

export interface ImageFileInputProps {
  /** The rear camera app instead of a file dialog: `capture="environment"`. Default false. */
  capture?: boolean
  /** Several files at once. Default false. */
  multiple?: boolean
  /** The accept list; default "image/*". */
  accept?: string
  disabled?: boolean
  /** The chosen files, in the order the system gave them. Not called for an empty choice. */
  onFiles: (files: File[]) => void
}

/**
 * The hidden `<input type=file>` for images, shared so no feature writes its own accept or capture. The host's visible button calls `open()`.
 * The value is reset after each choice, so the same file can be chosen again.
 */
export const ImageFileInput = forwardRef<ImageFileInputHandle, ImageFileInputProps>(function ImageFileInput(
  { capture = false, multiple = false, accept = 'image/*', disabled, onFiles },
  ref,
) {
  const input = useRef<HTMLInputElement>(null)
  const latest = useRef(onFiles)
  latest.current = onFiles
  useImperativeHandle(ref, () => ({ open: () => input.current?.click() }), [])

  const change = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length > 0) latest.current(files)
  }

  return (
    <input
      ref={input}
      type="file"
      hidden
      accept={accept}
      capture={capture ? 'environment' : undefined}
      multiple={multiple}
      disabled={disabled}
      onChange={change}
    />
  )
})
