import type { MouseEvent, ReactNode } from 'react'
import { Tile } from '../../../ui'
import { describeUse, tapAction } from '../lib/steps'
import { cookStrings } from '../strings'
import type { CookStep, StepUse } from '../types'

export interface StepTileProps {
  step: CookStep
  /** Tablet: the left half of the tile goes Back, the right half Next (lib/steps.tapAction). */
  tapZones?: boolean
  onBack: () => void
  onNext: () => void
  /** Formats one scaled use for display, e.g. "4 piece onion" (the User's unit system is the hook's business). */
  formatUse?: (use: StepUse) => string
}

/**
 * The large step tile: `article` labelled "Step N of M" holding the Step text,
 * the scaled uses as a list ("4 piece onion" by default: quantity, unit, name),
 * the Step's photo when it has one, and on a Passive Step a note with its
 * duration. With tapZones a click calls onBack/onNext by tapAction on the
 * article's bounding box. Renders and wires events only.
 */
export function StepTile({ step, tapZones = false, onBack, onNext, formatUse = describeUse }: StepTileProps): ReactNode {
  const onTap = (e: MouseEvent<HTMLElement>) => {
    if (!tapZones) return
    const action = tapAction(e.clientX, e.currentTarget.getBoundingClientRect())
    if (action === 'back') onBack()
    else if (action === 'next') onNext()
  }
  return (
    <Tile as="article" className="cook-step" aria-label={cookStrings.stepOf(step.number, step.of)} onClickCapture={onTap}>
      <p className="cook-step__count">{cookStrings.stepOf(step.number, step.of)}</p>
      <p className="cook-step__text">{step.text}</p>
      {step.uses.length > 0 ? (
        <ul className="cook-step__uses">
          {step.uses.map((use) => (
            <li key={`${use.ingredientId}-${use.unit}`}>{formatUse(use)}</li>
          ))}
        </ul>
      ) : null}
      {step.kind === 'passive' ? <p className="cook-step__note">{cookStrings.passiveNote(step.durationMinutes)}</p> : null}
      {step.imageUrl ? <img className="cook-step__image" src={step.imageUrl} alt="" /> : null}
    </Tile>
  )
}
