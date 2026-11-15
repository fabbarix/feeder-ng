import { Button, EmptyState, ListGroup, ListRow } from '../../../ui'
import { settingsStrings } from '../strings'
import type { Away } from '../../plan/types'
import { awayMeta, memberRowName } from '../lib/away'
import type { Member } from '../types'
import { MemberAvatar } from './MemberAvatar'
import '../settings.css'

export interface MemberListProps {
  members: Member[]
  canEdit: boolean
  /** Display names of linked Users by User id, the meta line of the Member's row. */
  linkedUserNames?: Record<number, string>
  onAdd: () => void
  onEdit: (member: Member) => void
  /** B9-46 (SET-16): each Member's running and coming Aways (soonest first), by Member id, and the Household's today. */
  aways?: Record<number, Away[]>
  today?: string
}

const text = settingsStrings.member

/** A ListGroup of Member rows: Avatar in the Member colour, name, linked-User meta, trailing "×1.25". An Admin's row opens
 *  the editor; a plain User's rows are static. Admins also get "Add Member". */
export function MemberList({ members, canEdit, linkedUserNames = {}, onAdd, onEdit, aways, today }: MemberListProps) {
  const addButton = canEdit ? (
    <Button variant="secondary" onClick={onAdd}>
      {text.add}
    </Button>
  ) : null
  if (members.length === 0) {
    return <EmptyState title={text.empty} description={canEdit ? text.emptyHint : undefined} action={addButton} />
  }
  return (
    <div className="settings__stack">
      <ListGroup label={settingsStrings.members}>
        {members.map((m) => {
          const linked = m.userId !== null ? linkedUserNames[m.userId] : undefined
          // B9-46 (SET-16): the next current or coming Away leads the meta line, in the info tone; the row is named with it.
          const away = aways && today ? awayMeta(aways[m.id] ?? [], today) : null
          return (
            <ListRow
              key={m.id}
              title={m.name}
              aria-label={memberRowName(m.name, away)}
              meta={[away, linked, m.email].filter(Boolean).join(' · ') || undefined}
              metaStatus={away ? 'info' : undefined}
              leading={<MemberAvatar name={m.name} colour={m.colour} avatar={m.avatar} photo={m.photo} size="sm" />}
              trailing={<span className="settings__portion-factor">{text.portionFactor(m.portionFactor)}</span>}
              onActivate={canEdit ? () => onEdit(m) : undefined}
            />
          )
        })}
      </ListGroup>
      {addButton}
    </div>
  )
}
