import type { ReactNode } from 'react'
import { Chip } from '../../../ui'
import { readStrings as t } from '../strings'
import type { ReadNoteInfo } from '../types'

/** Chips above an adopted review: "Read by Claude Haiku 5.5" and, for a page with recipe data, "The page's recipe data was used as a hint". */
export function ReadNote({ note }: { note: ReadNoteInfo }): ReactNode {
  return (
    <div className="import-chips">
      <Chip icon="assistant">{note.modelName ? t.readByModel(note.modelName) : t.readByAssistant}</Chip>
      {note.structuredData ? <Chip>{t.structuredHint}</Chip> : null}
    </div>
  )
}
