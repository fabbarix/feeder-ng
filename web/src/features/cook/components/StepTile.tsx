import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { Button, Icon, IconButton, Tile } from '../../../ui'
import { describeUse, nbspUnits, stepOverline, stepTextSize } from '../lib/steps'
import { tileTap } from '../lib/tapZone'
import { BaseRecipeChip } from './BaseRecipeChip'
import { StepPhotoDialog } from './StepPhotoDialog'
import { cookStrings } from '../strings'
import type { CookStep, StepUse } from '../types'

export interface StepTileProps {
  step: CookStep
  /** The left half of the tile goes Back, the right half Next (decision SHORT 3: the screen turns them on at every width). */
  tapZones?: boolean
  onBack: () => void
  onNext: () => void
  /** Formats one scaled use for display, e.g. "4 piece onion" (the User's unit system is the hook's business). */
  formatUse?: (use: StepUse) => string
  /** Shows the one-time coach mark (cookStrings.coachMark) with a "Got it" button; the first zone tap also calls onCoachDismiss. */
  coachMark?: boolean
  onCoachDismiss?: () => void
  /** The Course and Recipe caption "Side · Green beans" of a timeline of several Courses; shown only when given. */
  caption?: string | null
  /** The planned clock time "18:52" of the timeline: a meta line "Start at 18:52" with a clock icon; shown only when given. */
  clock?: string | null
  /** Base recipe names ready by this Step (the block before it ended): one "<name> ready" line each. */
  ready?: string[]
  /** Lines that belong to the Step, at the tile's end (the Base recipes Stock covers). */
  children?: ReactNode
}

/** The selector of what inside the tile is a control: a click there is the control's, never a tap zone's. */
const CONTROL = 'button, a, input, select, textarea, label, summary, [role="button"], [contenteditable="true"]'

function selecting(tile: HTMLElement): boolean {
  const sel = typeof window.getSelection === 'function' ? window.getSelection() : null
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false
  const node = sel.anchorNode
  return node !== null && tile.contains(node)
}

/**
 * The large Step tile (PC-03): `article` labelled "Step N of M". Its overline is "Step 2 of 5 · Active · 2 min" (lib/steps
 * stepOverline), a live status so a Step change is announced. The Step text (weight 500, `data-length` from stepTextSize, numbers
 * joined to their units), one muted "Uses ..." line, and the photo, capped, in a figure with "Enlarge the photo" that opens
 * StepPhotoDialog. With tapZones two aria-hidden zones show where to tap; a click goes Back or Next by lib/tapZone tileTap, never
 * on a scroll, a press of a control inside the tile, or while text is selected. Renders and wires events only.
 */
export function StepTile({
  step,
  tapZones = false,
  onBack,
  onNext,
  formatUse = describeUse,
  coachMark = false,
  onCoachDismiss,
  caption = null,
  clock = null,
  ready = [],
  children,
}: StepTileProps): ReactNode {
  const down = useRef<{ x: number; y: number } | null>(null)
  const [photoOpen, setPhotoOpen] = useState(false)
  // React events bubble through portals: a press inside the photo dialog is not the tile's.
  const inTile = (e: { target: EventTarget; currentTarget: HTMLElement }) => e.target instanceof Node && e.currentTarget.contains(e.target)
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    down.current = inTile(e) ? { x: e.clientX, y: e.clientY } : null
  }
  const onTap = (e: MouseEvent<HTMLElement>) => {
    const start = down.current
    down.current = null
    if (!tapZones || !inTile(e)) return
    const onControl = e.target instanceof Element && e.target.closest(CONTROL) !== null
    const action = tileTap({ x: e.clientX, y: e.clientY }, start, e.currentTarget.getBoundingClientRect(), { onControl, selecting: selecting(e.currentTarget) })
    if (action === null) return
    if (coachMark) onCoachDismiss?.()
    if (action === 'back') onBack()
    else onNext()
  }
  const text = nbspUnits(step.text)
  return (
    <Tile
      as="article"
      className="cook-step"
      aria-label={cookStrings.stepOf(step.number, step.of)}
      overline={<span role="status">{stepOverline(step)}</span>}
      onPointerDownCapture={onPointerDown}
      onClickCapture={onTap}
    >
      {caption ? <p className="cook-step__course">{caption}</p> : null}
      {clock ? (
        <p className="cook-step__clock">
          <Icon name="duration" size={16} />
          <span>{cookStrings.startAt(clock)}</span>
        </p>
      ) : null}
      {step.baseRecipe ? (
        <div className="cook-step__base">
          <BaseRecipeChip recipe={step.baseRecipe} />
        </div>
      ) : null}
      <p className="cook-step__text" data-length={stepTextSize(step.text)}>
        {text}
      </p>
      {ready.map((name) => (
        <p key={name} className="cook-step__ready">
          {cookStrings.baseReady(name)}
        </p>
      ))}
      {step.uses.length > 0 ? <p className="cook-step__uses">{nbspUnits(cookStrings.usesLine(step.uses.map(formatUse)))}</p> : null}
      {step.imageUrl ? (
        <figure className="cook-step__photo">
          <img className="cook-step__image" src={step.imageUrl} alt="" />
          <IconButton icon="enlarge" shape="circle" label={cookStrings.enlargePhoto} aria-haspopup="dialog" onClick={() => setPhotoOpen(true)} />
        </figure>
      ) : null}
      {children}
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
      {step.imageUrl ? <StepPhotoDialog open={photoOpen} src={step.imageUrl} number={step.number} onClose={() => setPhotoOpen(false)} /> : null}
    </Tile>
  )
}
