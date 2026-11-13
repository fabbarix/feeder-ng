import { useState } from 'react'
import { BottomSheet, Button, ListGroup, ListRow, TextField } from '../../../ui'
import { useDisplayUnitSystem } from '../hooks/useDisplayUnitSystem'
import { useMergeFlow } from '../hooks/useMergeFlow'
import { errorMessage } from '../lib/errorMessage'
import { totalReferences } from '../lib/references'
import { wordsFor } from '../lib/kind'
import { strings } from '../strings'
import type { IngredientKind } from '../types'
import { MergeConflictList } from './MergeConflictList'

export interface MergeSheetProps {
  open: boolean
  sourceId: number
  onClose: () => void
  /** Called with the surviving Ingredient's id after a successful merge. */
  onMerged: (targetId: number) => void
  /** H5: the kind both Ingredients must share (food when left out). */
  kind?: IngredientKind
}

/**
 * BottomSheet "Merge Ingredient" driven by useMergeFlow. Step 1: "Find the Ingredient to keep" input and a
 * button per candidate. Step 2: strings.mergeSummary, strings.mergeMoves(total source references) when > 0,
 * the blocked message when preview.blocked is set (no confirm button then), MergeConflictList when there are
 * conflicts, and a "Merge" button disabled until canMerge.
 */
export function MergeSheet({ open, sourceId, onClose, onMerged, kind = 'food' }: MergeSheetProps) {
  const flow = useMergeFlow(sourceId, kind)
  const system = useDisplayUnitSystem()
  const [error, setError] = useState<string | null>(null)
  const { target, preview } = flow
  const words = wordsFor(kind)

  const merge = async () => {
    setError(null)
    try {
      // Navigates to the survivor as soon as the merge succeeds, before the source's cache is dropped.
      await flow.merge((survivor) => onMerged(survivor.id))
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={words.mergeTitle}>
      {target === null ? (
        <>
          <TextField label={words.mergeFindLabel} value={flow.query} onChange={flow.setQuery} />
          <ListGroup label={words.mergeCandidatesLabel}>
            {flow.candidates.map((c) => (
              <ListRow key={c.id} title={c.name} onActivate={() => flow.selectTarget(c)} />
            ))}
          </ListGroup>
        </>
      ) : (
        <>
          {preview ? <p>{strings.mergeSummary(preview.source.name, target.name)}</p> : null}
          {preview && totalReferences(preview.sourceReferences) > 0 ? <p>{strings.mergeMoves(totalReferences(preview.sourceReferences))}</p> : null}
          {preview?.blocked ? <p role="alert">{preview.blocked === 'kind_differs' ? strings.mergeBlockedKind : words.mergeBlocked}</p> : null}
          {preview && preview.conflicts.length > 0 ? (
            <MergeConflictList
              conflicts={preview.conflicts}
              base={preview.target.baseUnit}
              system={system}
              answers={flow.answers}
              onAnswer={flow.answer}
            />
          ) : null}
          {preview && !preview.blocked ? (
            <Button disabled={!flow.canMerge} onClick={merge}>
              {strings.mergeConfirm}
            </Button>
          ) : null}
          <Button variant="tertiary" onClick={() => flow.selectTarget(null)}>
            {words.mergeChangeTarget}
          </Button>
          {error ? <p role="alert">{error}</p> : null}
        </>
      )}
    </BottomSheet>
  )
}
