import { forwardRef, type ReactNode } from 'react'

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

/** STUB (pr-t3 tests first): the hidden image `<input type=file>` shared by hosts that offer their own buttons. */
export const ImageFileInput = forwardRef<ImageFileInputHandle, ImageFileInputProps>(function ImageFileInput(_props, _ref): ReactNode {
  return null
})
