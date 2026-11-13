import type { ReactNode } from 'react'
import { Tile } from '../../../ui'
import type { ConfirmProblem } from '../lib/confirmErrors'
import { importStrings as s } from '../strings'

export interface ConfirmProblemTileProps {
  problem: ConfirmProblem | undefined
}

/** The refusal of Confirm, at the top of the review and announced (design §10, §11.3). The cycle is named with the server's words. */
export function ConfirmProblemTile({ problem }: ConfirmProblemTileProps): ReactNode {
  if (!problem) return null
  const text = (() => {
    switch (problem.kind) {
      case 'cycle':
        return (
          <>
            <strong>{s.baseRecipes.cycleTitle}</strong> {problem.message}
          </>
        )
      case 'notReady':
        return `${s.baseRecipes.notReady} ${problem.message}`
      case 'takeOver':
        return s.baseRecipes.takeOverBlocked(problem.ask.ingredient.name)
      case 'validation':
        return problem.message
    }
  })()
  return (
    <Tile variant="status" status="danger" role="alert" as="section" className="import-confirm-problem">
      <p>{text}</p>
    </Tile>
  )
}
