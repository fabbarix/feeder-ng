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
  const [rejected, setRejected] = useState(false)

  const onFiles = async ([file]: File[]) => {
    setRejected(false)
    onSubmit(await readText(file!))
  }

  return (
    <Tile as="section" overline={s.stepOverline(2)} overlineIcon="import">
      <h2>{s.stepTwoTitle}</h2>
      <FileDrop
        label={s.uploadLabel}
        accept=".json,application/json"
        disabled={busy}
        error={rejected ? s.rejectedFile : undefined}
        onFiles={(files) => void onFiles(files)}
        onReject={() => setRejected(true)}
      />
      <TextArea label={s.pasteLabel} rows={6} value={text} disabled={busy} onChange={setText} />
      <Button disabled={busy || text.trim() === ''} onClick={() => onSubmit(text)}>
        {s.review}
      </Button>
    </Tile>
  )
}
