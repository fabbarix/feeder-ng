import { useConfirm, useToast } from '../../../ui'
import { answerErrorMessage } from '../lib/format'
import { accessStrings } from '../strings'
import type { AccessRequest } from '../types'
import { useAccessHistory } from './useAccessHistory'
import { useAccessRequests } from './useAccessRequests'

/** The approvals page: the pending requests and history, with approve, and deny after a confirmation. A failure is shown as an error toast. */
export function useAccessRequestsPage() {
  const list = useAccessRequests()
  const history = useAccessHistory()
  const dialogs = useConfirm()
  const toast = useToast()

  const attempt = async (action: () => Promise<unknown>) => {
    try {
      await action()
    } catch (err) {
      toast.show(answerErrorMessage(err), { status: 'error' })
    }
  }

  const approve = (id: number) => void attempt(() => list.approve(id))
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
    approve,
    deny: (id: number) => void deny(id),
  }
}
