import { useId, useState, type ReactNode } from 'react'
import { Button, FileDrop, TextArea, Tile } from '../../../ui'
import { importStrings as s } from '../strings'
import { CopyAgentPromptButton } from './CopyAgentPromptButton'

export interface RecipeFileTileProps {
  busy: boolean
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

const t = s.start

/**
 * B9-28 (RX-11): the Recipe File path of Import. "Choose a file" in our own drop zone (the native input stays hidden in FileDrop), a
 * "Paste the JSON instead" disclosure that opens the JSON field and Review, and, under a divider, the Agent Prompt. Every action is an
 * outlined button (R-A); the page's one primary is "Read recipe".
 */
export function RecipeFileTile({ busy, onSubmit }: RecipeFileTileProps): ReactNode {
  const [text, setText] = useState('')
  const [pasting, setPasting] = useState(false)
  /** Why the chosen file was refused (not JSON, or it could not be read), or null. */
  const [error, setError] = useState<string | null>(null)
  const headingId = useId()
  const pasteId = useId()

  const onFiles = async ([file]: File[]) => {
    setError(null)
    try {
      onSubmit(await readText(file!))
    } catch {
      setError(s.readFailed)
    }
  }

  return (
    <Tile as="section" className="import-path recipe-file-tile" overline={t.fileOverline} overlineIcon="file" aria-labelledby={headingId}>
      <h2 id={headingId}>{t.fileTitle}</h2>
      <p className="import-path__meta">{t.fileMeta}</p>
      <FileDrop
        label={s.sourceTitle}
        buttonLabel={t.chooseFile}
        helper={t.dropHint}
        accept=".json,application/json"
        disabled={busy}
        error={error ?? undefined}
        onFiles={(files) => void onFiles(files)}
        onReject={() => setError(s.rejectedFile)}
      />
      <Button variant="secondary" size="sm" icon="clipboard" className="import-path__paste" aria-expanded={pasting} aria-controls={pasteId} onClick={() => setPasting((on) => !on)}>
        {t.pasteInstead}
      </Button>
      <div id={pasteId} className="import-path__paste-panel" hidden={!pasting}>
        {pasting ? (
          <>
            <TextArea label={t.jsonLabel} rows={6} value={text} disabled={busy} onChange={setText} />
            <Button variant="secondary" disabled={busy || text.trim() === ''} onClick={() => onSubmit(text)}>
              {s.review}
            </Button>
          </>
        ) : null}
      </div>
      <div className="import-path__aside">
        <p className="import-path__meta">{t.agentPrompt}</p>
        <CopyAgentPromptButton />
      </div>
    </Tile>
  )
}
