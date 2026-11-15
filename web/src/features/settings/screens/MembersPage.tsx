import { Skeleton, Tile } from '../../../ui'
import { MemberEditor } from '../components/MemberEditor'
import { MemberList } from '../components/MemberList'
import { SettingsHeader } from '../components/SettingsHeader'
import { SettingsLoadGate } from '../components/SettingsLoadGate'
import { useMemberListAways } from '../hooks/useMemberListAways'
import { useMembersPage } from '../hooks/useMembersPage'
import { settingsStrings } from '../strings'
import '../settings.css'

/** /settings/members: the Members as a list; an Admin adds and edits them in the sheet (Linked User from the allowlist). */
export function MembersPage() {
  const page = useMembersPage()
  // B9-46 (SET-16): each Member's next Away on the list.
  const away = useMemberListAways(page.members.members)
  return (
    <div className="settings">
      <SettingsHeader title={settingsStrings.members} />
      {/* B9-20 (RES-02): offline and never loaded is a LoadState, never an empty list. */}
      <SettingsLoadGate state={page.members.state} onRetry={page.members.refetch}>
        <Tile as="section" span="full" aria-label={settingsStrings.members}>
          {page.members.state === 'loading' ? (
            <Skeleton variant="row" count={3} label={settingsStrings.loading} />
          ) : (
            <MemberList
              members={page.members.members}
              canEdit={page.isAdmin}
              linkedUserNames={page.linkedUserNames}
              onAdd={page.add}
              onEdit={page.edit}
              aways={away.aways}
              today={away.today}
            />
          )}
        </Tile>
      </SettingsLoadGate>
      <MemberEditor
        open={page.editor !== null}
        member={page.editor?.item}
        users={page.users}
        currentUserId={page.currentUserId}
        members={page.members.members}
        saving={page.members.saving}
        error={page.error}
        emailError={page.emailError}
        onEmailEdit={page.clearEmailError}
        onSave={page.save}
        onDelete={page.remove}
        onClose={page.close}
      />
    </div>
  )
}
