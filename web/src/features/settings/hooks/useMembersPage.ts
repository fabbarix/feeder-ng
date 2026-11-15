import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../../lib/http'
import { actionFailed, failureToast } from '../../../lib/errorCopy'
import { useMe } from '../../../app/useMe'
import { useConfirm, useToast, useUndoToast } from '../../../ui'
import { settingsApi } from '../api'
import { memberRemovedToast, removeMemberDialog } from '../lib/memberRemoval'
import { settingsStrings } from '../strings'
import { errorMessage } from '../lib/errors'
import type { Member, MemberInput } from '../types'
import { useAllowlist } from './useAllowlist'
import { useHouseholdLiveUpdates } from './useHouseholdLiveUpdates'
import { useMembers } from './useMembers'
import { settingsKeys } from './queryKeys'

/** After a removal the sheet is gone: focus goes to the page's h1 ("Members"), made focusable from script if needed. */
function focusPageTitle() {
  const h1 = document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('h1')
  if (!h1) return
  if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1')
  h1.focus({ preventScroll: true })
}

/** The Members page: the Members, the allowlist's Users for "Linked User" (Admins only), and the add / edit / remove sheet. */
export function useMembersPage() {
  useHouseholdLiveUpdates()
  const me = useMe().data
  const isAdmin = Boolean(me?.isAdmin)
  const currentUserId = me?.id
  const members = useMembers()
  const queryClient = useQueryClient()
  const confirmApi = useConfirm()
  const toast = useToast()
  const undoToast = useUndoToast()
  const allowlist = useAllowlist(isAdmin)
  const [editor, setEditor] = useState<{ item?: Member } | null>(null)
  const [error, setError] = useState<string>()
  const [emailError, setEmailError] = useState<string>()
  // After a removal: the h1 takes focus once the sheet has gone (its unmount gives focus back to its opener first).
  const [titleFocus, setTitleFocus] = useState(0)
  useEffect(() => {
    if (titleFocus > 0) focusPageTitle()
  }, [titleFocus])
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

  /**
   * B9-36 (SAFE-02, SAFE 4): Remove Member reads what goes, asks with it as rows, then removes, closes the sheet, focuses the h1 and
   * offers Undo (restore by id). A failed read removes nothing; a refused removal stays in the sheet as its form error.
   */
  const remove = async () => {
    const editing = editor?.item
    if (!editing) return
    let impact
    try {
      impact = await settingsApi.memberImpact(editing.id)
    } catch (err) {
      toast.show(failureToast(actionFailed(settingsStrings.member.removal.impactPhrase(editing.name), err), () => void remove()))
      return
    }
    if (!(await confirmApi.confirm(removeMemberDialog(editing.name, impact)))) return
    try {
      await members.remove(editing.id)
    } catch (err) {
      refuse(err)
      return
    }
    clear()
    setEditor(null)
    setTitleFocus((n) => n + 1)
    const words = memberRemovedToast(editing.name)
    undoToast.show({
      headline: words.headline,
      undoAriaLabel: words.undoAriaLabel,
      restored: words.restored,
      undo: async () => {
        await settingsApi.restoreMember(editing.id)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: settingsKeys.members }),
          queryClient.invalidateQueries({ queryKey: settingsKeys.slots }),
        ])
      },
    })
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
