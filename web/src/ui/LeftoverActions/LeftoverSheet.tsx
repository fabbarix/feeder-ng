// The Had it / Threw it out / Freeze it / Take out sheet (BottomSheet + StepperField + Select).
// The draft (portions, chosen place) is local state; defaults and bounds come from lib/leftovers.
import { useState } from 'react'
import {
  actionLabel,
  claimNote,
  defaultFreezer,
  freezeDefaultPortions,
  freezeNote,
  freezeTitle,
  freezerPlaces,
  freezeUseBy,
  hadItDefault,
  hadItTitle,
  lostClaims,
  leftoverStrings,
  NOT_SORTED_PLACE,
  portionBounds,
  takeOutNote,
  takeOutPlaces,
  takeOutTitle,
  takeOutUseBy,
  throwOutDefault,
  throwOutTitle,
  type Leftover,
  type LeftoverActionKind,
  type LeftoverClaim,
  type LeftoverPlace,
  type LeftoverRequest,
} from '../../lib/leftovers'
import { BottomSheet } from '../BottomSheet'
import { Button } from '../Button'
import { StepperField } from '../fields/StepperField'
import { Select } from '../Select/Select'
import type { SelectOption } from '../Select/lib'
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
  /** Planned Meals served from this Leftover, soonest first. */
  claims: LeftoverClaim[]
  busy?: boolean
  onConfirm: (request: LeftoverRequest) => void
  onClose: () => void
  /** "Storage Places" link of the no-Freezer state (the parent navigates to Settings > Storage Places). */
  storagePlacesHref?: string
}

const TITLES: Record<LeftoverActionKind, (name: string) => string> = {
  'had-it': hadItTitle,
  'threw-out': throwOutTitle,
  freeze: freezeTitle,
  'take-out': takeOutTitle,
}

/** Mounted only while open, so every open starts from the defaults. */
export function LeftoverSheet(props: LeftoverSheetProps) {
  if (props.action === null) return null
  return <OpenSheet key={`${props.action}-${props.leftover.id}`} {...props} action={props.action} />
}

type OpenProps = LeftoverSheetProps & { action: LeftoverActionKind }

function OpenSheet({ action, leftover, today, storagePlaces, recipeFrozenUseBy, householdFrozenUseBy, recipeUseByDays, claims, busy = false, onConfirm, onClose, storagePlacesHref }: OpenProps) {
  const bounds = portionBounds(leftover.portions)
  const [portions, setPortions] = useState(() => initialPortions(action, leftover))
  const [placeId, setPlaceId] = useState<number | null>(() => initialPlace(action, storagePlaces))
  const freezers = freezerPlaces(storagePlaces)
  const request = requestFor(action, portions, placeId)
  const lost = action === 'take-out' ? [] : lostClaims(claims, leftover.portions - portions)
  const name = leftover.recipeName

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={TITLES[action](name)}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            {leftoverStrings.cancel}
          </Button>
          {request ? (
            <Button variant={action === 'threw-out' ? 'danger' : 'primary'} disabled={busy} onClick={() => onConfirm(request)}>
              {actionLabel(action)}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="leftover-sheet__stack">
        {action === 'had-it' || action === 'threw-out' || action === 'freeze' ? (
          <StepperField label={leftoverStrings.portions} value={portions} onChange={setPortions} min={bounds.min} max={bounds.max} step={bounds.step} />
        ) : null}

        {action === 'threw-out' ? <p className="leftover-sheet__note">{leftoverStrings.wasteNote}</p> : null}

        {action === 'freeze' && freezers.length === 0 ? (
          <p className="leftover-sheet__note">
            {leftoverStrings.addFreezerFirst}{' '}
            {storagePlacesHref ? (
              <a className="leftover-sheet__link" href={storagePlacesHref}>
                {leftoverStrings.storagePlaces}
              </a>
            ) : null}
          </p>
        ) : null}

        {action === 'freeze' && freezers.length > 0 ? (
          <>
            <Select<number>
              label={leftoverStrings.storagePlace}
              options={freezers.map(placeOption)}
              value={placeId}
              onChange={setPlaceId}
            />
            <p className="leftover-sheet__note">{freezeNoteFor(recipeFrozenUseBy, householdFrozenUseBy, today)}</p>
          </>
        ) : null}

        {action === 'take-out' ? (
          <>
            <Select<number>
              label={leftoverStrings.storagePlace}
              options={[...takeOutPlaces(storagePlaces).map(placeOption), { value: NOT_SORTED_PLACE, label: leftoverStrings.notSorted }]}
              value={placeId}
              onChange={setPlaceId}
            />
            <p className="leftover-sheet__note">{takeOutNoteFor(recipeUseByDays, today)}</p>
          </>
        ) : null}

        {lost.map((claim) => (
          <p key={`${claim.date}-${claim.slotName}`} className="leftover-sheet__note">
            {claimNote(claim)}
          </p>
        ))}
      </div>
    </BottomSheet>
  )
}

const placeOption = (p: LeftoverPlace): SelectOption<number> => ({ value: p.id, label: p.name })

function initialPortions(action: LeftoverActionKind, leftover: Leftover): number {
  switch (action) {
    case 'had-it':
      return hadItDefault(leftover.portions)
    case 'threw-out':
      return throwOutDefault(leftover.portions)
    case 'freeze':
      return freezeDefaultPortions(leftover.portions, leftover.plannedPortions)
    case 'take-out':
      return leftover.portions
  }
}

function initialPlace(action: LeftoverActionKind, places: LeftoverPlace[]): number | null {
  if (action === 'freeze') return defaultFreezer(places)?.id ?? null
  if (action === 'take-out') return NOT_SORTED_PLACE
  return null
}

/** What confirm sends, or null when the sheet has nothing to confirm (Freeze it with no Freezer). */
function requestFor(action: LeftoverActionKind, portions: number, placeId: number | null): LeftoverRequest | null {
  switch (action) {
    case 'had-it':
      return { kind: 'had-it', portions }
    case 'threw-out':
      return { kind: 'threw-out', portions }
    case 'freeze':
      return placeId === null ? null : { kind: 'freeze', storagePlaceId: placeId, portions }
    case 'take-out':
      return { kind: 'take-out', storagePlaceId: placeId === NOT_SORTED_PLACE ? null : placeId }
  }
}

function freezeNoteFor(recipeDays: number | null, householdDays: number, today: string): string {
  const { date, days } = freezeUseBy(today, recipeDays, householdDays)
  return freezeNote(date, days, today)
}

function takeOutNoteFor(useByDays: number, today: string): string {
  const { date, days } = takeOutUseBy(today, useByDays)
  return takeOutNote(date, days, today)
}
