// BR-H: the lines that say which Base recipes the Pantry covers, so the Step numbers that skip them are explained.
import type { ReactNode } from 'react'
import { cookStrings } from '../strings'

export interface BaseCoveredLinesProps {
  /** One line per covered Base recipe (lib/baseSteps coveredLines). */
  lines: string[]
}

/** A plain list named "Left out of the Steps", read in place; renders nothing when no Base recipe is covered. */
export function BaseCoveredLines({ lines }: BaseCoveredLinesProps): ReactNode {
  if (lines.length === 0) return null
  return (
    <ul className="cook-covered" aria-label={cookStrings.coveredHeading}>
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  )
}
