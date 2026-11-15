// The Had it / Threw it out / Freeze it / Take out sheet (BottomSheet + StepperField + Select).
// The draft (portions, chosen place) is local state; defaults, requests, choices and notes come from lib/leftovers/sheetModel.
import { useEffect, useId, useRef, useState } from 'react'
import { useHref, useInRouterContext, useLinkClickHandler } from 'react-router-dom'
import {
  actionLabel,
  freezeContext,
  freezeDestination,
  freezeHint,
  freezeLabel,
  freezeQuestion,
  hadItTitle,
  leftoverStrings,
  placeChoices,
  portionBounds,
  replannedNotes,
  sheetDefaults,
  sheetNotes,
  sheetRequest,
  snapPortions,
  takeOutTitle,
  throwOutTitle,
  type Leftover,
  type LeftoverActionKind,
  type LeftoverPlace,
  type LeftoverRequest,
  type SheetDraft,
  type SheetInput,
} from '../../lib/leftovers'
import { useReplanPreview } from '../../lib/leftovers/useLeftoverActions'
import { BottomSheet } from '../BottomSheet'
import { Button } from '../Button'
import { StepperField } from '../fields/StepperField'
import { Icon } from '../Icon'
import { Select } from '../Select/Select'
import { Stepper } from '../Stepper'
import './LeftoverActions.css'

export interface LeftoverSheetProps {
  /** Which sheet; null = closed. */
  action: LeftoverActionKind | null
  leftover: Leftover
  today: string
  storagePlaces: LeftoverPlace[]
  /** The Recipe's Frozen Use-by, else null (the Household's applies). */
  recipeFrozenUseBy: number | null
  householdFrozenUseBy: number
  /** The Recipe's Use-by days (Take out). */
  recipeUseByDays: number
  busy?: boolean
  /** B9-45 (PC-13): the Planned Meals that need portions of this Leftover ("Mon Dinner"); the Freeze sheet's hint names them. */
  plannedFor?: string[]
  onConfirm: (request: LeftoverRequest) => void
  onClose: () => void
  /** "Storage Places" link of the no-Freezer state (the parent navigates to Settings > Storage Places). */
  storagePlacesHref?: string
}

const TITLES: Record<Exclude<LeftoverActionKind, 'freeze'>, (name: string) => string> = {
  'had-it': hadItTitle,
  'threw-out': throwOutTitle,
  'take-out': takeOutTitle,
}

/** Mounted only while open, so every open starts from the defaults. */
export function LeftoverSheet(props: LeftoverSheetProps) {
  if (props.action === null) return null
  return <OpenSheet key={`${props.action}-${props.leftover.id}`} {...props} action={props.action} />
}

type OpenProps = LeftoverSheetProps & { action: LeftoverActionKind }

function OpenSheet(props: OpenProps) {
  return props.action === 'freeze' ? <FreezeSheet {...props} /> : <ActionSheet {...props} />
}

function ActionSheet({ action, leftover, today, storagePlaces, recipeFrozenUseBy, householdFrozenUseBy, recipeUseByDays, busy = false, onConfirm, onClose }: OpenProps) {
  const input: SheetInput = { action, leftover, places: storagePlaces, today, recipeFrozenUseBy, householdFrozenUseBy, recipeUseByDays }
  const [draft, setDraft] = useState<SheetDraft>(() => sheetDefaults(input))
  const request = sheetRequest(action, draft)
  // Take out never replans; every other draft asks the server what it would move.
  const replanned = useReplanPreview(leftover.id, request)
  const choices = placeChoices(action, storagePlaces)
  const bounds = portionBounds(leftover.portions)
  const name = leftover.recipeName

  return (
    <BottomSheet
      open
      onClose={onClose}
      onCancel={onClose}
      cancelLabel={leftoverStrings.cancel}
      title={TITLES[action as Exclude<LeftoverActionKind, 'freeze'>](name)}
      footer={
        request ? (
          <Button variant={action === 'threw-out' ? 'danger' : 'primary'} disabled={busy} onClick={() => onConfirm(request)}>
            {actionLabel(action)}
          </Button>
        ) : null
      }
    >
      <div className="leftover-sheet__stack">
        {action !== 'take-out' ? (
          <StepperField
            label={leftoverStrings.portions}
            value={draft.portions}
            onChange={(next) => setDraft((d) => ({ ...d, portions: snapPortions(d.portions, next, leftover.portions) }))}
            min={bounds.min}
            max={bounds.max}
            step={bounds.step}
          />
        ) : null}

        {choices.length > 0 ? (
          <Select<number>
            label={leftoverStrings.storagePlace}
            options={choices}
            value={draft.placeId}
            onChange={(placeId) => setDraft((d) => ({ ...d, placeId }))}
          />
        ) : null}

        {sheetNotes(input).map((note) => (
          <p key={note} className="leftover-sheet__note">
            {note}
          </p>
        ))}

        {replannedNotes(replanned).map((note) => (
          <p key={note.key} className="leftover-sheet__note">
            {note.text}
          </p>
        ))}
      </div>
    </BottomSheet>
  )
}

/**
 * B9-45 (PC-13): Freeze it as one question. "How many portions to freeze?" over the Recipe and what is left; a large Stepper in
 * quarters, every spare portion by default, the hint naming where the rest is planned; one meta line "Goes to Garage Freezer · Use by
 * 13 Feb" with Change (our own Select of the freezers, shown only while choosing); Cancel and the one primary "Freeze 1.25 portions".
 * No Close: the sheet has Cancel (R-B).
 */
function FreezeSheet({ leftover, today, storagePlaces, recipeFrozenUseBy, householdFrozenUseBy, recipeUseByDays, busy = false, plannedFor = [], onConfirm, onClose, storagePlacesHref }: OpenProps) {
  const input: SheetInput = { action: 'freeze', leftover, places: storagePlaces, today, recipeFrozenUseBy, householdFrozenUseBy, recipeUseByDays }
  const [draft, setDraft] = useState<SheetDraft>(() => sheetDefaults(input))
  const [choosing, setChoosing] = useState(false)
  const change = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)
  const hintId = useId()
  const request = sheetRequest('freeze', draft)
  const replanned = useReplanPreview(leftover.id, request)
  const choices = placeChoices('freeze', storagePlaces)
  const bounds = portionBounds(leftover.portions)
  const where = freezeDestination(input, draft.placeId)

  // After the freezer choice closes, focus goes back to Change (its line is back on screen).
  useEffect(() => {
    if (!choosing && returnFocus.current) {
      returnFocus.current = false
      change.current?.focus()
    }
  }, [choosing])
  const stopChoosing = () => {
    returnFocus.current = true
    setChoosing(false)
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      onCancel={onClose}
      cancelLabel={leftoverStrings.cancel}
      title={freezeQuestion}
      context={freezeContext(leftover.recipeName, leftover.portions)}
      footer={
        request ? (
          <Button variant="primary" icon="snowflake" disabled={busy} onClick={() => onConfirm(request)}>
            {freezeLabel(draft.portions)}
          </Button>
        ) : null
      }
    >
      <div className="leftover-freeze">
        <Stepper
          size="lg"
          label={leftoverStrings.portionsToFreeze}
          value={draft.portions}
          onChange={(next) => setDraft((d) => ({ ...d, portions: snapPortions(d.portions, next, leftover.portions) }))}
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          unit={leftoverStrings.portionsUnit}
          describedBy={hintId}
        />
        <p id={hintId} className="leftover-freeze__hint">
          {freezeHint(leftover.portions, leftover.plannedPortions, plannedFor)}
        </p>

        {choices.length === 0 ? (
          <p className="leftover-sheet__note">
            {leftoverStrings.addFreezerFirst} {storagePlacesHref ? <StoragePlacesLink href={storagePlacesHref} /> : null}
          </p>
        ) : choosing ? (
          <div className="leftover-freeze__choice">
            <Select<number>
              label={leftoverStrings.storagePlace}
              options={choices}
              value={draft.placeId}
              defaultOpen
              onOpenChange={(open) => {
                if (!open) stopChoosing()
              }}
              onChange={(placeId) => setDraft((d) => ({ ...d, placeId }))}
            />
          </div>
        ) : where ? (
          <p className="leftover-freeze__where">
            <Icon name="snowflake" size={16} />
            <span className="leftover-freeze__where-text">
              {leftoverStrings.goesTo} <strong>{where.placeName}</strong> · {where.useBy}
            </span>
            <Button ref={change} variant="secondary" size="sm" aria-label={leftoverStrings.changeStoragePlace} onClick={() => setChoosing(true)}>
              {leftoverStrings.change}
            </Button>
          </p>
        ) : null}

        {replannedNotes(replanned).map((note) => (
          <p key={note.key} className="leftover-sheet__note">
            {note.text}
          </p>
        ))}
      </div>
    </BottomSheet>
  )
}

/** The "Storage Places" link: client-side inside a Router (no reload), a plain anchor outside one. */
function StoragePlacesLink({ href }: { href: string }) {
  const inRouter = useInRouterContext()
  return inRouter ? <RouterStoragePlacesLink to={href} /> : <a className="leftover-sheet__link" href={href}>{leftoverStrings.storagePlaces}</a>
}

function RouterStoragePlacesLink({ to }: { to: string }) {
  const href = useHref(to)
  const onClick = useLinkClickHandler(to)
  return (
    <a className="leftover-sheet__link" href={href} onClick={onClick}>
      {leftoverStrings.storagePlaces}
    </a>
  )
}
