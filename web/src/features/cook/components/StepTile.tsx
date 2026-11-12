import type { MouseEvent, ReactNode } from 'react'
import { Button, Icon, Tile } from '../../../ui'
import { describeUse, stepOverline, tapAction } from '../lib/steps'
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
  /** Tablet: shows the one-time coach mark (cookStrings.coachMark) with a "Got it" button that calls onCoachDismiss. */
  coachMark?: boolean
  onCoachDismiss?: () => void
  /** CRS F (STUB: not rendered yet): the Course and Recipe caption "Side · Green beans", shown only when given. */
  caption?: string | null
  /** CRS F (STUB: not rendered yet): the planned clock time "18:52", shown only when given. */
  clock?: string | null
}

/**
 * The large Step tile: `article` labelled "Step N of M", its overline (stepOverline: "Passive · 15 min timer"), the
 * Step text, one muted "Uses ..." line with the scaled amounts, and the Step's photo when it has one. With tapZones
 * two visible, aria-hidden zones show where to tap, and a click on the article calls onBack/onNext by tapAction; a
 * click on a button inside (the coach mark's "Got it") is left to that button. Renders and wires events only.
 */
export function StepTile({
  step,
  tapZones = false,
  onBack,
  onNext,
  formatUse = describeUse,
  coachMark = false,
  onCoachDismiss,
}: StepTileProps): ReactNode {
  const onTap = (e: MouseEvent<HTMLElement>) => {
    if (!tapZones) return
    if (e.target instanceof Element && e.target.closest('button')) return
    const action = tapAction(e.clientX, e.currentTarget.getBoundingClientRect())
    if (action === 'back') onBack()
    else if (action === 'next') onNext()
  }
  return (
    <Tile as="article" className="cook-step" aria-label={cookStrings.stepOf(step.number, step.of)} overline={stepOverline(step)} onClickCapture={onTap}>
      <p className="cook-step__text">{step.text}</p>
      {step.uses.length > 0 ? <p className="cook-step__uses">{cookStrings.usesLine(step.uses.map(formatUse))}</p> : null}
      {step.imageUrl ? <img className="cook-step__image" src={step.imageUrl} alt="" /> : null}
      {tapZones ? (
        <>
          <span className="cook-step__zone cook-step__zone--back" data-zone="back" aria-hidden="true">
            <Icon name="chevron" size={28} />
          </span>
          <span className="cook-step__zone cook-step__zone--next" data-zone="next" aria-hidden="true">
            <Icon name="chevron" size={28} />
          </span>
        </>
      ) : null}
      {coachMark ? (
        <div className="cook-step__coach">
          <p>{cookStrings.coachMark}</p>
          <Button variant="secondary" size="sm" onClick={() => onCoachDismiss?.()}>
            {cookStrings.coachMarkDismiss}
          </Button>
        </div>
      ) : null}
    </Tile>
  )
}
