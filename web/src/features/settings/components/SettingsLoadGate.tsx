// B9-20 (RES-02): a Settings page whose data is not known yet. Offline and never loaded: the LoadState, never an empty
// list or the defaults. Failed: the ErrorState with Try again. Otherwise the page itself, which shows its own loading.
import type { ReactNode } from 'react'
import type { ScreenState } from '../../../lib/dataState'
import { ErrorState, LoadState } from '../../../ui'
import { settingsStrings } from '../strings'

export interface SettingsLoadGateProps {
  state: ScreenState
  onRetry: () => void
  /** The failed line; default "Settings could not load. Try again in a moment." */
  errorMessage?: string
  /** The page; without it the gate renders only the unknown or failed state. */
  children?: ReactNode
}

export function SettingsLoadGate({ state, onRetry, errorMessage = settingsStrings.loadError, children }: SettingsLoadGateProps) {
  if (state === 'offlineUnknown') return <LoadState title={settingsStrings.offline.title} text={settingsStrings.offline.text} />
  if (state === 'failed') return <ErrorState message={errorMessage} onRetry={onRetry} />
  return <>{children ?? null}</>
}
