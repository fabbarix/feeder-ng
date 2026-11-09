import { useState } from 'react'
import { BottomSheet, Button } from '../../../ui'
import { useDisplayUnitSystem } from '../hooks/useDisplayUnitSystem'
import { useMergeFlow } from '../hooks/useMergeFlow'
import { errorMessage } from '../lib/errorMessage'
import { totalReferences } from '../lib/references'
import { strings } from '../strings'
import { MergeConflictList } from './MergeConflictList'

export interface MergeSheetProps {
  open: boolean
  sourceId: number
  onClose: () => void
  /** Called with the surviving Ingredient's id after a successful merge. */
  onMerged: (targetId: number) => void
}

/**
 * BottomSheet "Merge Ingredient" driven by useMergeFlow. Step 1: "Find the Ingredient to keep" input and a
 * button per candidate. Step 2: strings.mergeSummary, strings.mergeMoves(total source references) when > 0,
 * the blocked message when preview.blocked is set (no confirm button then), MergeConflictList when there are
 * conflicts, and a "Merge" button disabled until canMerge.
 */
export function MergeSheet({ open, sourceId, onClose, onMerged }: MergeSheetProps) {
  const flow = useMergeFlow(sourceId)
  const system = useDisplayUnitSystem()
  const [error, setError] = useState<string | null>(null)
  const { target, preview } = flow

  const merge = async () => {
    setError(null)
    try {
      const survivor = await flow.merge()
      onMerged(survivor.id)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={strings.mergeTitle}>
      {target === null ? (
        <>
          <label>
            {strings.mergeFindLabel}
            <input value={flow.query} onChange={(e) => flow.setQuery(e.target.value)} />
          </label>
          <ul>
            {flow.candidates.map((c) => (
              <li key={c.id}>
                <Button variant="tonal" onClick={() => flow.selectTarget(c)}>
                  {c.name}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          {preview ? <p>{strings.mergeSummary(preview.source.name, target.name)}</p> : null}
          {preview && totalReferences(preview.sourceReferences) > 0 ? <p>{strings.mergeMoves(totalReferences(preview.sourceReferences))}</p> : null}
          {preview?.blocked ? <p role="alert">{strings.mergeBlocked}</p> : null}
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
          <Button variant="ghost" onClick={() => flow.selectTarget(null)}>
            {strings.mergeChangeTarget}
          </Button>
          {error ? <p role="alert">{error}</p> : null}
        </>
      )}
    </BottomSheet>
  )
}
