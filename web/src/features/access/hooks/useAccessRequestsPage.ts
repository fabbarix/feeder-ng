import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../../lib/http'
import { useConfirm, useToast } from '../../../ui'
import { answerErrorMessage } from '../lib/format'
import { accessStrings } from '../strings'
import type { AccessRequest } from '../types'
import { useAccessHistory } from './useAccessHistory'
import { accessKeys } from './queryKeys'
import { useAccessRequests } from './useAccessRequests'
import { useUnlinkedMembers } from './useUnlinkedMembers'

/** The approvals page: the pending requests and history, with approve, and deny after a confirmation. A failure is shown as an error toast. */
export function useAccessRequestsPage() {
  const list = useAccessRequests()
  const history = useAccessHistory()
  const dialogs = useConfirm()
  const toast = useToast()
  const queryClient = useQueryClient()
  // The request whose approve sheet is open, and what the last attempt said (shown inside the sheet).
  const [approvingId, setApprovingId] = useState<number | null>(null)
  const [approveError, setApproveError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const approving = list.requests.find((r) => r.id === approvingId) ?? null
  const members = useUnlinkedMembers(approving !== null)

  const attempt = async (action: () => Promise<unknown>) => {
    try {
      await action()
    } catch (err) {
      toast.show(answerErrorMessage(err), { status: 'error' })
    }
  }

  const closeApprove = () => {
    setApprovingId(null)
    setApproveError(undefined)
  }
  const startApprove = (id: number) => {
    setApproveError(undefined)
    setApprovingId(id)
  }
  const confirmApprove = async (memberId?: number) => {
    if (approvingId === null) return
    setBusy(true)
    setApproveError(undefined)
    try {
      await list.approve(approvingId, memberId)
      closeApprove()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Somebody linked that Member meanwhile: refresh the picker and let the approver choose again.
        setApproveError(answerErrorMessage(err))
        void queryClient.invalidateQueries({ queryKey: [...accessKeys.members] })
      } else if (err instanceof ApiError && err.status === 404) {
        closeApprove()
        toast.show(answerErrorMessage(err), { status: 'error' })
      } else {
        setApproveError(answerErrorMessage(err))
      }
    } finally {
      setBusy(false)
    }
  }
  const deny = async (id: number) => {
    const target: AccessRequest | undefined = list.requests.find((r) => r.id === id)
    const yes = await dialogs.confirm({
      title: accessStrings.confirmDenyTitle(target?.email ?? ''),
      body: accessStrings.confirmDenyBody,
      confirmLabel: accessStrings.deny,
      tone: 'danger',
    })
    if (yes) await attempt(() => list.deny(id))
  }

  return {
    requests: list.requests,
    isPending: list.isPending,
    isError: list.isError,
    events: history.events,
    now: new Date(),
    approve: startApprove,
    approveSheet: {
      request: approving,
      members: members.members,
      membersFailed: members.isError,
      busy,
      error: approveError,
      onApprove: (memberId?: number) => void confirmApprove(memberId),
      onCancel: closeApprove,
    },
    deny: (id: number) => void deny(id),
  }
}
