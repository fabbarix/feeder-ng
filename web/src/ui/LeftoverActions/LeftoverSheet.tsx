// The Had it / Threw it out / Freeze it / Take out sheet (BottomSheet + StepperField + Select).
// The draft (portions, chosen place) is local state; defaults, requests, choices and notes come from lib/leftovers/sheetModel.
import { useState } from 'react'
import { useHref, useInRouterContext, useLinkClickHandler } from 'react-router-dom'
import {
  actionLabel,
  freezeTitle,
  hadItTitle,
  leftoverStrings,
  placeChoices,
  portionBounds,
  replannedNotes,
  sheetDefaults,
  sheetNotes,
  sheetRequest,
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
import { Select } from '../Select/Select'
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

function OpenSheet({ action, leftover, today, storagePlaces, recipeFrozenUseBy, householdFrozenUseBy, recipeUseByDays, busy = false, onConfirm, onClose, storagePlacesHref }: OpenProps) {
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
        {action !== 'take-out' ? (
          <StepperField
            label={leftoverStrings.portions}
            value={draft.portions}
            onChange={(portions) => setDraft((d) => ({ ...d, portions }))}
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

        {action === 'freeze' && choices.length === 0 ? (
          <p className="leftover-sheet__note">
            {leftoverStrings.addFreezerFirst} {storagePlacesHref ? <StoragePlacesLink href={storagePlacesHref} /> : null}
          </p>
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
