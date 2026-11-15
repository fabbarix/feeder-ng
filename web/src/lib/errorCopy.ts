// B9-20 (RES-06): the copy of a failed save or action: what failed, and what the person can do. Plain TypeScript.
import type { ToastContent } from '../ui/Toast'
import { ApiError } from './http'

export interface FailureCopy {
  icon: 'error' | 'offline'
  headline: string
  subline?: string
  body?: string
  retryable: boolean
}
export interface FailureOptions {
  known?: Record<string, string>
  online?: boolean
  /** a 4xx ApiError with a message of its own is shown as that one line (the Shop's refusals); default false */
  serverMessage?: boolean
}

const STILL_THERE = 'Your choices are still on the screen.'
const OFFLINE_SUBLINE = 'Feeder is offline'
const OFFLINE_BODY = `Try again when you’re back online. ${STILL_THERE}`

const browserOnline = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)

/** Offline is the browser's flag, or a request that never reached the server. A timeout reached it and is a server failure. */
function isOffline(err: unknown, online: boolean): boolean {
  if (!online) return true
  return err instanceof ApiError && err.status === 0 && err.code !== 'timeout'
}

/** "Couldn’t {phrase}": a Shop action ("mark Cauliflower Not needed") or, through saveFailed, a save. */
export function actionFailed(phrase: string, err: unknown, opts: FailureOptions = {}): FailureCopy {
  const online = opts.online ?? browserOnline()
  const headline = `Couldn’t ${phrase}`
  if (isOffline(err, online)) return { icon: 'offline', headline, subline: OFFLINE_SUBLINE, body: OFFLINE_BODY, retryable: false }
  if (err instanceof ApiError) {
    const known = opts.known?.[err.code]
    if (known) return { icon: 'error', headline: known, retryable: false }
    if (opts.serverMessage && err.status >= 400 && err.status < 500 && err.message) {
      return { icon: 'error', headline: err.message, retryable: false }
    }
  }
  return { icon: 'error', headline, body: STILL_THERE, retryable: true }
}

export function saveFailed(thing: string, err: unknown, opts?: FailureOptions): FailureCopy {
  return actionFailed(`save ${thing}`, err, opts)
}

/** The rich Toast content for `useToast().show`; Try again only when a second try can work and there is one to run. */
export function failureToast(copy: FailureCopy, onRetry?: () => void): ToastContent {
  const toast: ToastContent = { status: copy.icon, title: copy.headline }
  if (copy.subline) toast.subline = copy.subline
  if (copy.body) toast.body = copy.body
  if (copy.retryable && onRetry) toast.actions = [{ label: 'Try again', onClick: onRetry }]
  return toast
}

/** The one sentence a form shows inline when no code is known. */
export function fallbackMessage(err: unknown, opts: Pick<FailureOptions, 'online'> = {}): string {
  return isOffline(err, opts.online ?? browserOnline())
    ? 'Feeder is offline. Try again when you’re back online.'
    : `Couldn’t save. ${STILL_THERE}`
}
