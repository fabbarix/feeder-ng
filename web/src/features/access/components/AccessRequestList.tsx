import { Button, ListGroup, ListRow, Muted } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { EmailText, NameText } from './BreakText'
import { RequestAvatar } from './RequestAvatar'
import { requestWhen } from '../lib/requests'
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

/**
 * SET-12: an R-E row per pending request. Leading the neutral monogram (or the Google photo); the name is the title and the email
 * the meta (with no name, the email is the title and the meta "No name from Google"); the state is the value ("12 days left",
 * warn tone at 2 days or fewer) with "asked 2 days ago" under it; Deny (danger secondary) and Approve in the actions slot.
 * Google text is shown as text.
 */
export function AccessRequestList({ requests, now = new Date(), error, onApprove, onDeny }: AccessRequestListProps) {
  return (
    <div className="access__stack">
      <FormError>{error}</FormError>
      {requests.length === 0 ? (
        <Muted>{accessStrings.empty}</Muted>
      ) : (
        <>
          <Muted>{accessStrings.approvalNote}</Muted>
          <div className="access__list">
            <ListGroup label={accessStrings.title}>
              {requests.map((r) => {
                const when = requestWhen(r, now)
                const named = r.name.trim() !== ''
                return (
                  <ListRow
                    key={r.id}
                    title={named ? <NameText name={r.name} /> : <EmailText email={r.email} />}
                    wrapTitle
                    meta={named ? <EmailText email={r.email} /> : accessStrings.noName}
                    leading={<RequestAvatar name={r.name || r.email} picture={r.picture} size="md" />}
                    value={<span data-tone={when.soon ? 'warn' : undefined}>{when.value}</span>}
                    subValue={when.subValue}
                    actions={
                      <span className="access__actions">
                        <Button variant="danger-secondary" aria-label={accessStrings.denyLabel(r.email)} onClick={() => onDeny(r.id)}>
                          {accessStrings.deny}
                        </Button>
                        <Button variant="secondary" aria-label={accessStrings.approveLabel(r.email)} onClick={() => onApprove(r.id)}>
                          {accessStrings.approve}
                        </Button>
                      </span>
                    }
                  />
                )
              })}
            </ListGroup>
          </div>
        </>
      )}
    </div>
  )
}
