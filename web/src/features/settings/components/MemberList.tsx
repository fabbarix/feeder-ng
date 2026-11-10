import { Button, EmptyState, ListGroup, ListRow } from '../../../ui'
import { settingsStrings } from '../strings'
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
}

const text = settingsStrings.member

/** A ListGroup of Member rows: Avatar in the Member colour, name, linked-User meta, trailing "×1.25". An Admin's row opens
 *  the editor; a plain User's rows are static. Admins also get "Add Member". */
export function MemberList({ members, canEdit, linkedUserNames = {}, onAdd, onEdit }: MemberListProps) {
  const addButton = canEdit ? (
    <Button variant="tertiary" onClick={onAdd}>
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
          return (
            <ListRow
              key={m.id}
              title={m.name}
              meta={linked}
              leading={<MemberAvatar name={m.name} colour={m.colour} avatar={m.avatar} size="sm" />}
              trailing={<span className="settings__muted">{text.portionFactor(m.portionFactor)}</span>}
              onActivate={canEdit ? () => onEdit(m) : undefined}
            />
          )
        })}
      </ListGroup>
      {addButton}
    </div>
  )
}
