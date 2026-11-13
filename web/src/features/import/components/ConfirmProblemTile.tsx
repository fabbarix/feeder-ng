import type { ReactNode } from 'react'
import { Tile } from '../../../ui'
import type { ConfirmProblem } from '../lib/confirmErrors'
import { importStrings as s } from '../strings'

export interface ConfirmProblemTileProps {
  problem: ConfirmProblem | undefined
}

/** A message that ends with a full stop: the server's own punctuation is kept, never doubled. */
function sentence(message: string): string {
  return /[.!?]$/.test(message.trim()) ? message.trim() : `${message.trim()}.`
}

/**
 * The refusal of Confirm, at the top of the review and announced (design §10, §11.3). A cycle names itself with the server's words. A take-over
 * ask shows nothing here: it is answered on its own tile or in its own dialog.
 */
export function ConfirmProblemTile({ problem }: ConfirmProblemTileProps): ReactNode {
  if (!problem || problem.kind === 'takeOver') return null
  const text = (() => {
    switch (problem.kind) {
      case 'cycle':
        return (
          <>
            <strong>{s.baseRecipes.cycleTitle}</strong> {sentence(problem.message)}
          </>
        )
      case 'notReady':
        return s.notReady
      case 'validation':
        return problem.message
    }
  })()
  return (
    <Tile variant="status" status="danger" role="alert" as="section">
      <p>{text}</p>
    </Tile>
  )
}
