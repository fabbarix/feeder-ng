import { useId, useState, type ChangeEvent, type ReactNode } from 'react'
import { Button, Tile } from '../../../ui'
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

/** Upload a .feeder.json file (labelled importStrings.uploadLabel; choosing one submits its text) or paste JSON (importStrings.pasteLabel) and press Review (disabled when blank or busy). */
export function ImportSource({ busy, onSubmit }: ImportSourceProps): ReactNode {
  const [text, setText] = useState('')
  const pasteId = useId()
  const uploadId = useId()

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    onSubmit(await readText(file))
  }

  return (
    <Tile size="wide" as="section" aria-label={s.sourceTitle}>
      <h2>{s.sourceTitle}</h2>
      <label htmlFor={uploadId}>{s.uploadLabel}</label>
      <input id={uploadId} type="file" accept=".json,application/json" disabled={busy} onChange={onFile} />
      <label htmlFor={pasteId}>{s.pasteLabel}</label>
      <textarea id={pasteId} rows={8} value={text} onChange={(e) => setText(e.target.value)} />
      <Button disabled={busy || text.trim() === ''} onClick={() => onSubmit(text)}>
        {s.review}
      </Button>
    </Tile>
  )
}
