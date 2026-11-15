// B9-20 (RES-06): the copy of a failed save or action. Plain TypeScript. STUB for the tests.
import type { ToastContent } from '../ui/Toast'

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

export function actionFailed(_phrase: string, _err: unknown, _opts?: FailureOptions): FailureCopy {
  throw new Error('not implemented (B9-20)')
}
export function saveFailed(_thing: string, _err: unknown, _opts?: FailureOptions): FailureCopy {
  throw new Error('not implemented (B9-20)')
}
export function failureToast(_copy: FailureCopy, _onRetry?: () => void): ToastContent {
  throw new Error('not implemented (B9-20)')
}
export function fallbackMessage(_err: unknown, _opts?: Pick<FailureOptions, 'online'>): string {
  throw new Error('not implemented (B9-20)')
}
