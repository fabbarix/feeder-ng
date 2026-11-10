import { useState } from 'react'
import { useMe } from '../../../app/useMe'
import { settingsStrings } from '../strings'
import { errorMessage } from '../lib/errors'
import type { Member, MemberInput } from '../types'
import { useAllowlist } from './useAllowlist'
import { useHouseholdLiveUpdates } from './useHouseholdLiveUpdates'
import { useMembers } from './useMembers'

/** The Members page: the Members, the allowlist's Users for "Linked User" (Admins only), and the add / edit / remove sheet. */
export function useMembersPage() {
  useHouseholdLiveUpdates()
  const me = useMe().data
  const isAdmin = Boolean(me?.isAdmin)
  const currentUserId = me?.id
  const members = useMembers()
  const allowlist = useAllowlist(isAdmin)
  const [editor, setEditor] = useState<{ item?: Member } | null>(null)
  const [error, setError] = useState<string>()

  const linkedUserNames = Object.fromEntries(allowlist.users.map((u) => [u.id, u.id === currentUserId ? settingsStrings.member.you(u.displayName) : u.displayName])) as Record<number, string>

  const save = async (input: MemberInput, userId: number | null) => {
    const editing = editor?.item
    try {
      const saved = editing ? await members.update(editing.id, input) : await members.create(input)
      if (userId !== (editing?.userId ?? null)) await members.linkUser(saved.id, userId)
      setError(undefined)
      setEditor(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const remove = async () => {
    const editing = editor?.item
    if (!editing) return
    try {
      await members.remove(editing.id)
      setError(undefined)
      setEditor(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return {
    isAdmin,
    currentUserId,
    members,
    users: allowlist.users,
    linkedUserNames,
    editor,
    error,
    add: () => (setError(undefined), setEditor({})),
    edit: (item: Member) => (setError(undefined), setEditor({ item })),
    close: () => setEditor(null),
    save,
    remove,
  }
}
