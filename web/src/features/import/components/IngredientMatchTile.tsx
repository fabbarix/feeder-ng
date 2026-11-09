import { useId, useState, type ReactNode } from 'react'
import { Button, Chip, Tile } from '../../../ui'
import { ingredientOptions } from '../lib/reviewSummary'
import { importStrings as s } from '../strings'
import type { BaseUnit, IngredientMatch, IngredientStatus } from '../types'

export interface IngredientMatchTileProps {
  match: IngredientMatch
  onUseExisting: (ingredientId: number) => void
  onCreate: (opts?: { name?: string; baseUnit?: BaseUnit }) => void
}

const statusLabel: Record<IngredientStatus, string> = {
  exact: s.statusExact,
  suggested: s.statusSuggested,
  new: s.statusNew,
  undefined: s.statusUndefined,
  conflict: s.statusConflict,
}

const baseUnits: BaseUnit[] = ['g', 'ml', 'piece']

/**
 * One Ingredient of the file. Shows its name and a Chip with the status label (importStrings.status*).
 * - exact: "Matches <existing name>" and no actions needed (but "Create new" stays available).
 * - suggested: one button per suggestion (importStrings.useExisting(name)) and "Create new" (pressed by default via match.effective).
 * - new: states it will be created from its definition; "Create new" pressed.
 * - undefined: Base Unit Chips g / ml / piece (choosing one calls onCreate({baseUnit})) plus any suggestions.
 * - conflict: importStrings.conflictText(file, existing); buttons "Use <existing name>" (onUseExisting(match.id)) and a text field
 *   (importStrings.newNameLabel) + "Create under this name" (onCreate({name}), disabled while blank).
 */
export function IngredientMatchTile({ match, onUseExisting, onCreate }: IngredientMatchTileProps): ReactNode {
  return (
    <Tile as="section" aria-label={match.name}>
      <h2>{match.name}</h2>
      <Chip>{statusLabel[match.status]}</Chip>
      {match.status === 'exact' && match.match ? <p>{match.match.name}</p> : null}
      {match.status === 'undefined' ? <BaseUnitChoices onCreate={onCreate} /> : null}
      {match.status === 'conflict' && match.conflict ? <p>{s.conflictText(match.conflict.file, match.conflict.existing)}</p> : null}
      {match.status !== 'conflict' ? <Options match={match} onUseExisting={onUseExisting} onCreate={onCreate} /> : null}
      {match.status === 'conflict' && match.match ? (
        <>
          <Button variant="tonal" onClick={() => onUseExisting(match.match!.id)}>
            {s.useExisting(match.match.name)}
          </Button>
          <NewName onCreate={onCreate} />
        </>
      ) : null}
    </Tile>
  )
}

function BaseUnitChoices({ onCreate }: { onCreate: IngredientMatchTileProps['onCreate'] }): ReactNode {
  return (
    <div>
      {baseUnits.map((u) => (
        <Chip key={u} onClick={() => onCreate({ baseUnit: u })}>
          {u}
        </Chip>
      ))}
    </div>
  )
}

/** Chips for the matches and suggestions of a row, and "Create new" for the rows that can be created. */
function Options({ match, onUseExisting, onCreate }: IngredientMatchTileProps): ReactNode {
  // An exact match is already named above, so only suggestions are offered as choices.
  const choices = ingredientOptions(match).filter((o) => o.kind === 'suggestion')
  return (
    <div>
      {choices.map((o) => (
        <Chip
          key={`${o.kind}-${o.id}`}
          selected={match.effective?.action === 'use' && match.effective.ingredientId === o.id}
          onClick={() => onUseExisting(o.id!)}
        >
          {s.useExisting(o.label)}
        </Chip>
      ))}
      {match.status === 'undefined' ? null : (
        <Chip selected={match.effective?.action === 'create'} onClick={() => onCreate()}>
          {s.createNew}
        </Chip>
      )}
    </div>
  )
}

/** A name field and "Create under this name", disabled while the name is blank. */
function NewName({ onCreate }: { onCreate: IngredientMatchTileProps['onCreate'] }): ReactNode {
  const [name, setName] = useState('')
  const id = useId()
  const trimmed = name.trim()
  return (
    <>
      <label htmlFor={id}>{s.newNameLabel}</label>
      <input id={id} type="text" value={name} onChange={(e) => setName(e.target.value)} />
      <Button variant="tonal" disabled={trimmed === ''} onClick={() => onCreate({ name: trimmed })}>
        {s.createUnder}
      </Button>
    </>
  )
}
