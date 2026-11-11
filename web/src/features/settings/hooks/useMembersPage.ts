import { useState } from 'react'
import { ApiError } from '../../../lib/http'
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
  const [emailError, setEmailError] = useState<string>()
  const refuse = (err: unknown) => {
    const forEmail = err instanceof ApiError && (err.code === 'email_taken' || (err.code === 'validation_failed' && /\bemail\b/i.test(err.message)))
    setError(forEmail ? undefined : errorMessage(err))
    setEmailError(forEmail ? errorMessage(err) : undefined)
  }
  const clear = () => (setError(undefined), setEmailError(undefined))

  const linkedUserNames = Object.fromEntries(allowlist.users.map((u) => [u.id, u.id === currentUserId ? settingsStrings.member.you(u.displayName) : u.displayName])) as Record<number, string>

  const save = async (input: MemberInput, userId: number | null) => {
    const editing = editor?.item
    try {
      const saved = editing ? await members.update(editing.id, input) : await members.create(input)
      if (userId !== (editing?.userId ?? null)) await members.linkUser(saved.id, userId)
      clear()
      setEditor(null)
    } catch (err) {
      refuse(err)
    }
  }

  const remove = async () => {
    const editing = editor?.item
    if (!editing) return
    try {
      await members.remove(editing.id)
      clear()
      setEditor(null)
    } catch (err) {
      refuse(err)
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
    emailError,
    clearEmailError: () => setEmailError(undefined),
    add: () => (clear(), setEditor({})),
    edit: (item: Member) => (clear(), setEditor({ item })),
    close: () => setEditor(null),
    save,
    remove,
  }
}
