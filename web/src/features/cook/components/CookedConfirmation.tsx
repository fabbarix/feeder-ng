// B9-45 (PC-02): the Cooked moment. A friendly confirmation in place of the Step: a 96 px success check that pops in, "Cooked, nice one!"
// (the page heading, focused), the Recipe and the meal, where the Leftover went in its own tile, the children (the ONE Stock notice and
// its sheet), and the footer: Undo Cooked (secondary) and the way back to where Cook Mode was opened from (primary). Never a danger tile.
import { useEffect, useRef, type ReactNode } from 'react'
import { leftoverTile, type LeftoverOutcome } from '../../plan/lib/cook'
import { Button, Icon, Tile } from '../../../ui'
import { cookedLine, type CookedLeftover } from '../lib/cooked'
import { cookStrings } from '../strings'

export interface CookedConfirmationProps {
  recipeName: string | null
  /** "Sat Dinner", after the Recipe name. */
  mealLabel?: string
  /** Where the Leftover went (plan/lib/cook leftoverTile); no tile for kind "none". */
  outcome?: LeftoverOutcome | null
  /** Several Leftovers (a Mark all Cooked): one tile each, named by its Recipe; wins over `outcome`. */
  leftovers?: CookedLeftover[]
  /** "Back to Plan" or "Back to Today" (lib/origin backLabel); default "Back to Today". */
  leaveLabel?: string
  /** Undo Cooked (SAFE-03), named `undoLabel`; no button without it. */
  onUndo?: () => void
  undoLabel?: string
  /** True while the Undo is being sent. */
  undoBusy?: boolean
  /** The shortfall notice and the Correct Stock sheet, rendered under the outcome. */
  children?: ReactNode
  /** The primary: leaves Cook Mode. */
  onLeave: () => void
}

export function CookedConfirmation({ recipeName, mealLabel, outcome, leftovers, leaveLabel, onUndo, undoLabel, undoBusy, children, onLeave }: CookedConfirmationProps): ReactNode {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const tiles = (leftovers ?? (outcome ? [{ outcome }] : [])).flatMap((l, i) => {
    const tile = leftoverTile(l.outcome)
    return tile ? [{ key: i, title: tile.title, meta: l.recipeName ? `${l.recipeName} · ${tile.meta}` : tile.meta }] : []
  })
  const line = mealLabel ? cookedLine(recipeName, mealLabel) : (recipeName ?? '')
  return (
    <section className="cook-confirmation" aria-labelledby="cook-confirmation-title">
      <div className="cook-confirmation__hero">
        <span className="cook-confirmation__mark">
          <Icon name="success" size={96} weight="fill" />
        </span>
        <h1 id="cook-confirmation-title" ref={heading} tabIndex={-1} className="cook-confirmation__title">
          {cookStrings.cookedCheer}
        </h1>
        {line ? <p className="cook-confirmation__recipe">{line}</p> : null}
      </div>
      {tiles.map((tile) => (
        <Tile key={tile.key} as="section" variant="status" status="leftover" span="full">
          <p className="cook-confirmation__outcome">
            <Icon name="leftover" size={28} />
            <span className="cook-confirmation__outcome-text">
              <span className="cook-confirmation__outcome-title">{tile.title}</span>
              <span className="cook-confirmation__outcome-meta">{tile.meta}</span>
            </span>
          </p>
        </Tile>
      ))}
      {children}
      <div className="cook-confirmation__actions">
        {onUndo ? (
          <Button variant="secondary" size="lg" icon="undo" aria-label={undoLabel} onClick={onUndo} disabled={undoBusy}>
            {cookStrings.undoCooked}
          </Button>
        ) : null}
        <Button variant="primary" size="lg" onClick={onLeave}>
          {leaveLabel ?? cookStrings.backToToday}
        </Button>
      </div>
    </section>
  )
}
