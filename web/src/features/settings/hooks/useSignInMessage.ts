import { useCallback, useState } from 'react'
import { useToast } from '../../../ui'
import { useCopyText } from '../../../ui/lib/useCopyText'
import { useShareText } from '../../../ui/lib/useShareText'
import { sharePayload, signInMessage } from '../lib/allowlist'
import { settingsStrings } from '../strings'

const text = settingsStrings.allowlistPanel

/** The sign-in message the fallback sheet shows when neither the share sheet nor the clipboard took it. */
export interface SignInFallback {
  message: string
  /** The control that started it; focus goes back there when the sheet closes. */
  starter: HTMLElement | null
}

export interface SignInMessageApi {
  /** The device has a share sheet that takes the payload (decided once per page load). */
  canShare: boolean
  /** Copies the message for `email`: a toast on success, else the fallback sheet. */
  copyFor: (email: string, starter: HTMLElement | null) => Promise<void>
  /** Shares the message for `email`: nothing on success or cancel; on failure it copies instead. */
  shareFor: (email: string, starter: HTMLElement | null) => Promise<void>
  /** The toast after "Add to allowlist", offering Share or Copy. */
  announceAdded: (email: string) => void
  fallback: SignInFallback | null
  closeFallback: () => void
}

const origin = () => (typeof window === 'undefined' ? '' : window.location.origin)
const PROBE = sharePayload('name@example.test', origin())

const refocus = (el: HTMLElement | null) => {
  if (el && el.isConnected) el.focus()
}

/** SET-03: telling a newly allowed person where and how to sign in, through the share sheet or the clipboard (never a native prompt). */
export function useSignInMessage(): SignInMessageApi {
  const toast = useToast()
  const { copy } = useCopyText()
  const { canShare, share } = useShareText(PROBE)
  const [fallback, setFallback] = useState<SignInFallback | null>(null)

  const copyMessage = useCallback(
    async (email: string, starter: HTMLElement | null, subline?: string) => {
      const message = signInMessage(email, origin())
      if (await copy(message)) {
        toast.show({ status: 'success', title: text.copied, subline })
        refocus(starter)
      } else {
        setFallback({ message, starter })
      }
    },
    [copy, toast],
  )

  const copyFor = useCallback((email: string, starter: HTMLElement | null) => copyMessage(email, starter), [copyMessage])

  const shareFor = useCallback(
    async (email: string, starter: HTMLElement | null) => {
      const outcome = await share(sharePayload(email, origin()))
      if (outcome === 'failed') await copyMessage(email, starter, text.shareDidNotOpen)
      else refocus(starter)
    },
    [share, copyMessage],
  )

  const announceAdded = useCallback(
    (email: string) => {
      toast.show({
        status: 'success',
        title: text.added(email),
        subline: text.addedSubline,
        actions: [
          {
            label: canShare ? text.shareAction : text.copyItem,
            onClick: () => void (canShare ? shareFor(email, null) : copyFor(email, null)),
          },
        ],
      })
    },
    [toast, canShare, shareFor, copyFor],
  )

  const closeFallback = useCallback(() => {
    const starter = fallback?.starter ?? null
    setFallback(null)
    // After the sheet has closed (and restored its own focus), the control that started it has the focus.
    setTimeout(() => refocus(starter), 0)
  }, [fallback])

  return { canShare, copyFor, shareFor, announceAdded, fallback, closeFallback }
}
