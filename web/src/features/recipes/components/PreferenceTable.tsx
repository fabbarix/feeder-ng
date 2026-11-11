import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Chip, EmptyState, ErrorState, Icon, IconButton } from '../../../ui'
import type { IconName } from '../../../ui/icons'
import type { PreferenceRow } from '../lib/preferenceRows'
import { recipeStrings } from '../strings'
import type { PreferenceState } from '../types'

export interface PreferenceTableProps {
  /** Names the table: "Preferences for <recipeName>" (screen-reader-only caption). */
  recipeName: string
  /** One row per Member, from lib/preferenceRows (the linked Member first). */
  rows: PreferenceRow[]
  /** A state button was pressed: the hook applies nextState. */
  onToggle: (memberId: number, tapped: Exclude<PreferenceState, 'none'>) => void
  /** The row to highlight (a #preference-member-<id> link). */
  highlightedMemberId?: number | null
  /** Admins get "Add Members" in the empty state. */
  isAdmin?: boolean
  /** The preferences failed to load: an ErrorState with a retry. */
  error?: boolean
  onRetry?: () => void
}

type State = Exclude<PreferenceState, 'none'>
const STATES: { state: State; label: string; icon: IconName }[] = [
  { state: 'favourite', label: recipeStrings.favourite, icon: 'favourite' },
  { state: 'dislike', label: recipeStrings.dislike, icon: 'dislike' },
  { state: 'exclusion', label: recipeStrings.exclusion, icon: 'exclusion' },
]

/**
 * The Recipe's preferences of the whole Household: a real table, one row per Member, one column per state, each cell
 * a toggle button (rx-pt.md section 5.3). An Exclusion that comes from an Ingredient is shown read-only.
 */
export function PreferenceTable({ recipeName, rows, onToggle, highlightedMemberId = null, isAdmin = false, error = false, onRetry }: PreferenceTableProps): ReactNode {
  if (error) return <ErrorState message={recipeStrings.preferencesLoadError} onRetry={onRetry} />
  if (rows.length === 0) {
    return (
      <EmptyState
        headingLevel={3}
        title={recipeStrings.noMembers}
        action={isAdmin ? <Link className="button" data-variant="tertiary" data-size="sm" to="/settings/members">{recipeStrings.addMembers}</Link> : <p>{recipeStrings.askAdmin}</p>}
      />
    )
  }
  return (
    <>
      <table className="preference-table">
        <caption className="visually-hidden">{recipeStrings.preferencesFor(recipeName)}</caption>
        <thead>
          <tr>
            <th scope="col" className="preference-table__member">
              {recipeStrings.memberColumn}
            </th>
            {STATES.map((s) => (
              <th key={s.state} scope="col" className="preference-table__state">
                <span className="preference-table__head-icon">
                  <Icon name={s.icon} size={20} />
                </span>
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.member.id}
              id={`preference-member-${row.member.id}`}
              className="preference-table__row"
              data-highlighted={highlightedMemberId === row.member.id ? 'true' : undefined}
            >
              <th scope="row" className="preference-table__member">
                <span className="preference-table__who">
                  <Avatar name={row.member.name} imageUrl={row.member.photoUrl} colour={row.member.colour} glyph={row.member.avatar} size="sm" />
                  <span className="preference-table__name">{row.member.name}</span>
                  {row.you ? <Chip kind="tag">{recipeStrings.you}</Chip> : null}
                </span>
              </th>
              {STATES.map((s) => (
                <td key={s.state} className="preference-table__cell">
                  <StateCell row={row} state={s.state} label={s.label} icon={s.icon} onToggle={onToggle} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.some((r) => r.via.length > 0) ? <p className="preference-table__note">{recipeStrings.viaNote}</p> : null}
    </>
  )
}

interface StateCellProps {
  row: PreferenceRow
  state: State
  label: string
  icon: IconName
  onToggle: (memberId: number, tapped: State) => void
}

/** One state of one Member. The Exclusion column shows a read-only "via garlic" when only an Ingredient causes it. */
function StateCell({ row, state, label, icon, onToggle }: StateCellProps): ReactNode {
  const via = row.via.join(', ')
  if (state === 'exclusion' && row.state !== 'exclusion' && row.via.length > 0) {
    return (
      <span className="preference-table__via">
        <Icon name="exclusion" size={16} weight="fill" />
        <span className="visually-hidden">{recipeStrings.excludedVia}</span>
        {` ${recipeStrings.via} ${via}`}
      </span>
    )
  }
  const alsoVia = state === 'exclusion' && row.state === 'exclusion' && row.via.length > 0
  return (
    <>
      <IconButton icon={icon} label={recipeStrings.stateToggle(row.member.name, label)} pressed={row.state === state} onClick={() => onToggle(row.member.id, state)} />
      {alsoVia ? <span className="preference-table__via">{`${recipeStrings.alsoVia} ${via}`}</span> : null}
    </>
  )
}
