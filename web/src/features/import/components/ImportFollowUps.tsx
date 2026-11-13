import type { ReactNode } from 'react'
import { Button } from '../../../ui'
import { LinkCandidatesSheet } from '../../recipes/components/LinkCandidatesSheet'
import { readNextItems, readNextLabel, type ReadNextTarget } from '../lib/confirmFollowUps'
import { useImportFollowUps } from '../hooks/useImportFollowUps'
import type { ImportResult } from '../types'

export interface ImportFollowUpsProps {
  result: ImportResult
  /** "Read Béchamel now": the Read step opens for that Base recipe. */
  onReadNext: (target: ReadNextTarget) => void
}

/**
 * BR-E (design §13), after a Confirm: "Read Béchamel now" for each created Base recipe the User asked to read next, and the bulk link sheet
 * (BR-D's LinkCandidatesSheet, nothing ticked) for each Base recipe the import created or converted, one after the other.
 */
export function ImportFollowUps({ result, onReadNext }: ImportFollowUpsProps): ReactNode {
  const follow = useImportFollowUps(result)
  const reads = readNextItems(result)
  return (
    <>
      {reads.length > 0 ? (
        <div className="import-follow-ups">
          {reads.map((target) => (
            <Button key={target.recipeId} variant="secondary" onClick={() => onReadNext(target)}>
              {readNextLabel(target.name)}
            </Button>
          ))}
        </div>
      ) : null}
      {follow.target ? <LinkCandidatesSheet key={follow.target.id} open baseRecipe={follow.target} onClose={follow.next} /> : null}
    </>
  )
}
