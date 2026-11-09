import type { ReactNode } from 'react'

export interface ImportSourceProps {
  busy: boolean
  /** Called with the file's text, from the upload or the pasted JSON. */
  onSubmit: (text: string) => void
}

/** Upload a .feeder.json file (labelled importStrings.uploadLabel; choosing one submits its text) or paste JSON (importStrings.pasteLabel) and press Review (disabled when blank or busy). */
export function ImportSource(props: ImportSourceProps): ReactNode {
  void props
  throw new Error('not implemented')
}
