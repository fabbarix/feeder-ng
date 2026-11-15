// B9-46 (SET-16): the Away section of the Member sheet (PC-08's "Away tile"): a title-3 "Away", each current or coming Away as a
// row (range, state, detail: lib/away's awayRow, through useMemberAwaySection) that opens the Away sheet, and "Add an Away", which opens it with this Member chosen.
import { useContext, type ReactNode } from 'react'
import { QueryClientContext } from '@tanstack/react-query'
import { Button, ListGroup, ListRow, Muted } from '../../../ui'
import { AwaySheet } from '../../plan/components/AwaySheet'
import { awayStrings } from '../../plan/strings/away'
import { useMemberAwaySection } from '../hooks/useMemberAwaySection'
import type { Member } from '../types'
import '../settings.css'

const s = awayStrings.away

export function MemberAwaySection({ member }: { member: Member }): ReactNode {
  // The Member sheet is also drawn without the app's data layer (its own tests); the Aways need it, so the section waits for it.
  const client = useContext(QueryClientContext)
  return client ? <AwaySection member={member} /> : null
}

function AwaySection({ member }: { member: Member }): ReactNode {
  const section = useMemberAwaySection(member.id)
  const { sheet } = section
  return (
    <section className="member-away" aria-labelledby={`member-away-${member.id}`}>
      <h3 id={`member-away-${member.id}`} className="member-away__title">
        {s.sectionTitle}
      </h3>
      {section.rows.length > 0 ? (
        <ListGroup label={s.listName(member.name)}>
          {section.rows.map((row) => (
            <ListRow
              key={row.away.id}
              title={row.title}
              aria-label={row.name}
              meta={row.detail}
              metaLines={2}
              value={row.state}
              chevron
              haspopup="dialog"
              onActivate={() => section.openAway(row.away)}
            />
          ))}
        </ListGroup>
      ) : section.loading ? null : (
        <Muted>{s.none}</Muted>
      )}
      <div className="member-away__add">
        <Button ref={section.addRef} variant="secondary" icon="add" onClick={section.openNew}>
          {s.addAway}
        </Button>
      </div>
      <AwaySheet
        key={sheet ? (sheet.kind === 'edit' ? `edit-${sheet.away.id}` : 'new') : 'closed'}
        open={sheet !== null}
        memberId={member.id}
        away={sheet?.kind === 'edit' ? sheet.away : undefined}
        onClose={section.close}
      />
    </section>
  )
}
