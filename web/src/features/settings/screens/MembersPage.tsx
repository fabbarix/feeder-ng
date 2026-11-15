import { ErrorState, LoadState, Skeleton, Tile } from '../../../ui'
import { MemberEditor } from '../components/MemberEditor'
import { MemberList } from '../components/MemberList'
import { SettingsHeader } from '../components/SettingsHeader'
import { useMembersPage } from '../hooks/useMembersPage'
import { settingsStrings } from '../strings'
import '../settings.css'

/** /settings/members: the Members as a list; an Admin adds and edits them in the sheet (Linked User from the allowlist). */
export function MembersPage() {
  const page = useMembersPage()
  return (
    <div className="settings">
      <SettingsHeader title={settingsStrings.members} />
      {/* B9-20 (RES-02): offline and never loaded is a LoadState, never an empty list. */}
      {page.members.state === 'offlineUnknown' ? (
        <LoadState title={settingsStrings.offline.title} text={settingsStrings.offline.text} />
      ) : page.members.state === 'failed' ? (
        <ErrorState message={settingsStrings.loadError} onRetry={page.members.refetch} />
      ) : (
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
            />
          )}
        </Tile>
      )}
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
