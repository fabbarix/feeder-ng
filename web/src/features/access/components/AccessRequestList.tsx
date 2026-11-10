import { Avatar, Button, ListGroup, ListRow } from '../../../ui'
import { agoText } from '../lib/format'
import { daysLeft } from '../lib/requests'
import { accessStrings } from '../strings'
import type { AccessRequest } from '../types'
import '../access.css'

export interface AccessRequestListProps {
  requests: AccessRequest[]
  now?: Date
  error?: string
  onApprove: (id: number) => void
  onDeny: (id: number) => void
}

/** A row per pending request: avatar, name, email, "asked N days ago", days left, Approve and Deny. Google text is shown as text. */
export function AccessRequestList({ requests, now = new Date(), error, onApprove, onDeny }: AccessRequestListProps) {
  return (
    <div className="access__stack">
      {error ? (
        <p role="alert" className="access__error">
          {error}
        </p>
      ) : null}
      {requests.length === 0 ? (
        <p className="access__muted">{accessStrings.empty}</p>
      ) : (
        <>
          <p className="access__muted">{accessStrings.approvalNote}</p>
          <ListGroup label={accessStrings.title}>
            {requests.map((r) => (
              <ListRow
                key={r.id}
                title={r.name}
                meta={r.email}
                leading={<Avatar name={r.name} imageUrl={r.picture || undefined} size="md" />}
                trailing={
                  <span className="access__actions">
                    <Button variant="tertiary" aria-label={accessStrings.denyLabel(r.email)} onClick={() => onDeny(r.id)}>
                      {accessStrings.deny}
                    </Button>
                    <Button variant="secondary" aria-label={accessStrings.approveLabel(r.email)} onClick={() => onApprove(r.id)}>
                      {accessStrings.approve}
                    </Button>
                  </span>
                }
              >
                <span className="access__when">
                  {accessStrings.asked(agoText(r.requestedAt, now))} · {accessStrings.daysLeft(daysLeft(r.expiresAt, now))}
                </span>
              </ListRow>
            ))}
          </ListGroup>
        </>
      )}
    </div>
  )
}
