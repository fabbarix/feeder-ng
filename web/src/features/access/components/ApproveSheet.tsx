import { useState } from 'react'
import { Avatar, BottomSheet, Button, Select } from '../../../ui'
import { linkableMembers, unlinkedMembers } from '../lib/members'
import { accessStrings } from '../strings'
import type { AccessMember, AccessRequest } from '../types'
import '../access.css'

export interface ApproveSheetProps {
  /** The request being approved; the sheet is open while this is set. */
  request: AccessRequest | null
  /** Members that can still be linked (those with no User). */
  members: AccessMember[]
  membersFailed?: boolean
  busy?: boolean
  /** A refusal to show inside the sheet, for example "That Member already has a User". */
  error?: string
  /** `memberId` is undefined when nobody was picked. */
  onApprove: (memberId?: number) => void
  onCancel: () => void
}

/**
 * Approve step (decision A3): a BottomSheet with an optional Member picker on the shared Select and the buttons
 * Cancel and Approve. Only Members who may take this request's email are offered (no email, or the same one). A pick that is
 * no longer offered (someone else linked it) counts as no pick.
 */
export function ApproveSheet({ request, members, membersFailed, busy, error, onApprove, onCancel }: ApproveSheetProps) {
  const [picked, setPicked] = useState<number | null>(null)
  if (!request) return null
  const t = accessStrings.approveSheet
  const offered = linkableMembers(members, request.email)
  const choice = picked !== null && offered.some((m) => m.id === picked) ? picked : null
  const footer = (
    <span className="access__actions">
      <Button variant="tertiary" disabled={busy} onClick={onCancel}>
        {t.cancel}
      </Button>
      <Button variant="primary" disabled={busy} onClick={() => onApprove(choice ?? undefined)}>
        {accessStrings.approve}
      </Button>
    </span>
  )
  return (
    <BottomSheet open onClose={onCancel} title={t.title} footer={footer}>
      <div className="access__stack">
        <p className="access__muted access__wrap">{t.explain(request.name, request.email)}</p>
        {error ? (
          <p role="alert" className="access__error">
            {error}
          </p>
        ) : null}
        {membersFailed ? (
          <p className="access__muted">{t.membersFailed}</p>
        ) : offered.length === 0 ? (
          <p className="access__muted">{unlinkedMembers(members).length === 0 ? t.noFreeMembers : t.noLinkableMembers}</p>
        ) : (
          <Select<number>
            label={t.memberLabel}
            entityName="Member"
            options={offered.map((m) => ({
              value: m.id,
              label: m.name,
              leading: <Avatar name={m.name} imageUrl={m.avatar || undefined} size="sm" />,
            }))}
            value={choice}
            onChange={setPicked}
            clearLabel={t.dontLink}
            onClear={() => setPicked(null)}
          />
        )}
      </div>
    </BottomSheet>
  )
}
