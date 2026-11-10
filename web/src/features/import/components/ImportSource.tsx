import { useState, type ReactNode } from 'react'
import { Button, FileDrop, Tile, TextArea } from '../../../ui'
import { importStrings as s } from '../strings'

export interface ImportSourceProps {
  busy: boolean
  /** Called with the file's text, from the upload or the pasted JSON. */
  onSubmit: (text: string) => void
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

/**
 * Step 2 of the import: a FileDrop for a .feeder.json file (choosing one submits its text; a file that is not JSON is
 * refused with importStrings.rejectedFile) or pasted JSON in a text area, then Review (disabled when blank or busy).
 */
export function ImportSource({ busy, onSubmit }: ImportSourceProps): ReactNode {
  const [text, setText] = useState('')
  /** Why the chosen file was refused (not JSON, or it could not be read), or null. */
  const [error, setError] = useState<string | null>(null)

  const onFiles = async ([file]: File[]) => {
    setError(null)
    try {
      onSubmit(await readText(file!))
    } catch {
      setError(s.readFailed)
    }
  }

  return (
    <Tile as="section" overline={s.stepOverline(2)} overlineIcon="import">
      <h2>{s.stepTwoTitle}</h2>
      <FileDrop
        label={s.uploadLabel}
        accept=".json,application/json"
        disabled={busy}
        error={error ?? undefined}
        onFiles={(files) => void onFiles(files)}
        onReject={() => setError(s.rejectedFile)}
      />
      <TextArea label={s.pasteLabel} rows={6} value={text} disabled={busy} onChange={setText} />
      <Button disabled={busy || text.trim() === ''} onClick={() => onSubmit(text)}>
        {s.review}
      </Button>
    </Tile>
  )
}
