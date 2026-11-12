import type { ReactElement } from 'react'
import type { SaveResult, SheetState, TagFormValues } from '../types'

export interface TagSheetProps {
  /** null = closed. */
  sheet: SheetState | null
  /** The colour a new Tag starts with. */
  newColour: string
  onClose: () => void
  /** Resolves ok to close; a refusal keeps the sheet and shows `error` under Name. */
  onSave: (values: TagFormValues) => Promise<SaveResult>
  /** Merge into…: only an edit sheet shows it. */
  onMerge: () => void
  /** Delete Tag: only an edit sheet shows it. */
  onDelete: () => void
}

/** The Tag sheet: Name, Tag colour picker with a live pill, Save, and (editing) Merge into… and Delete Tag. */
export function TagSheet(_props: TagSheetProps): ReactElement | null {
  return null
}
