// "Merge fish into…": the shared Tag select (every other Tag), Cancel and Review merge.
import type { ReactElement } from 'react'
import type { Tag } from '../../../lib/tags'
import { Button, Dialog, TagSelect } from '../../../ui'
import { tagsStrings } from '../strings'
import type { MergePickerState } from '../types'

export interface MergeTargetDialogProps {
  /** null = closed. */
  state: MergePickerState | null
  tags: readonly Tag[]
  busy: boolean
  onTarget: (id: number) => void
  onReview: () => void
  onClose: () => void
}

/** "Merge fish into…": the shared Tag select (every other Tag), Cancel and Review merge. */
export function MergeTargetDialog({ state, tags, busy, onTarget, onReview, onClose }: MergeTargetDialogProps): ReactElement | null {
  if (!state) return null
  return (
    <Dialog
      open
      onClose={onClose}
      title={tagsStrings.merge.pickerTitle(state.source.name)}
      actions={
        <>
          <Button type="button" variant="tertiary" onClick={onClose}>
            {tagsStrings.merge.cancel}
          </Button>
          <Button type="button" variant="primary" disabled={state.targetId === null || busy} loading={busy} onClick={onReview}>
            {tagsStrings.merge.review}
          </Button>
        </>
      }
    >
      <TagSelect label={tagsStrings.merge.pickerLabel} tags={tags} value={state.targetId} exclude={state.source.id} onChange={onTarget} />
    </Dialog>
  )
}
