import { Tile } from '../../../ui'
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
      <Tile as="section" span="full" aria-label={settingsStrings.members}>
        <MemberList
          members={page.members.members}
          canEdit={page.isAdmin}
          linkedUserNames={page.linkedUserNames}
          onAdd={page.add}
          onEdit={page.edit}
        />
      </Tile>
      <MemberEditor
        open={page.editor !== null}
        member={page.editor?.item}
        users={page.users}
        currentUserId={page.currentUserId}
        members={page.members.members}
        saving={page.members.saving}
        error={page.error}
        onSave={page.save}
        onDelete={page.remove}
        onClose={page.close}
      />
    </div>
  )
}
