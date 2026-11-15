import { useId, useState } from 'react'
import { BottomSheet, Button, DetailList, DetailRow, ListGroup, ListRow, Overline, TextField } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { useDisplayUnitSystem } from '../hooks/useDisplayUnitSystem'
import { useMergeFlow } from '../hooks/useMergeFlow'
import { errorMessage } from '../lib/errorMessage'
import { mergeMovesGroup } from '../lib/impact'
import { wordsFor } from '../lib/kind'
import { strings } from '../strings'
import type { IngredientKind } from '../types'
import { MergeConflictList } from './MergeConflictList'
import '../ingredients.css'

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
 * button per candidate. Step 2: strings.mergeSummary, what moves as "Moves to <target>" rows (R-E), the blocked message
 * (the one FormError) when preview.blocked is set (no confirm button then), MergeConflictList when there are
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
          {preview ? <MovesRows targetName={target.name} sourceReferences={preview.sourceReferences} /> : null}
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
          <Button variant="secondary" onClick={() => flow.selectTarget(null)}>
            {words.mergeChangeTarget}
          </Button>
          <FormError>{preview?.blocked ? (preview.blocked === 'kind_differs' ? strings.mergeBlockedKind : words.mergeBlocked) : error}</FormError>
        </>
      )}
    </BottomSheet>
  )
}

/** SAFE-02 (R-E): what moves to the Ingredient that is kept, as labelled rows; nothing when nothing moves. */
function MovesRows({ targetName, sourceReferences }: { targetName: string; sourceReferences: Record<string, number> }) {
  const id = useId()
  const group = mergeMovesGroup(targetName, sourceReferences)
  if (!group) return null
  return (
    <div className="merge-sheet__moves">
      <Overline id={id}>{group.label}</Overline>
      <DetailList aria-labelledby={id}>
        {group.rows.map((row) => (
          <DetailRow key={row.key} label={row.key} state={row.state} />
        ))}
      </DetailList>
    </div>
  )
}
