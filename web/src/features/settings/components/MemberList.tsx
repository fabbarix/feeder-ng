import { Avatar, Button, Chip, EmptyState, Tile } from '../../../ui'
import { settingsStrings } from '../strings'
import type { Member } from '../types'
import '../settings.css'

export interface MemberListProps {
  members: Member[]
  canEdit: boolean
  /** Display names of linked Users by User id, shown as a chip on the Member. */
  linkedUserNames?: Record<number, string>
  onAdd: () => void
  onEdit: (member: Member) => void
}

const text = settingsStrings.member

/** Member tiles (Avatar, name, "Portion Factor 0.5", linked-User chip). Admins get "Add Member" and "Edit <name>". */
export function MemberList({ members, canEdit, linkedUserNames = {}, onAdd, onEdit }: MemberListProps) {
  const addButton = canEdit ? <Button onClick={onAdd}>{text.add}</Button> : null
  if (members.length === 0) {
    return <EmptyState title={text.empty} description={canEdit ? text.emptyHint : undefined} action={addButton} />
  }
  return (
    <div className="settings__stack">
      <ul className="settings__list">
        {members.map((m) => (
          <li key={m.id}>
            <Tile size="wide">
              <div className="settings__row settings__row--between">
                <div className="settings__row">
                  <Avatar name={m.name} size="sm" />
                  <span className="settings__dot" style={{ background: m.colour }} aria-hidden="true" />
                  {m.avatar ? <span aria-hidden="true">{m.avatar}</span> : null}
                  <span>{m.name}</span>
                  <span className="settings__muted">{text.portionFactor(m.portionFactor)}</span>
                  {m.userId !== null && linkedUserNames[m.userId] ? <Chip tone="accent">{linkedUserNames[m.userId]}</Chip> : null}
                </div>
                {canEdit ? (
                  <Button variant="tonal" aria-label={text.edit(m.name)} onClick={() => onEdit(m)}>
                    {text.editButton}
                  </Button>
                ) : null}
              </div>
            </Tile>
          </li>
        ))}
      </ul>
      {addButton}
    </div>
  )
}
