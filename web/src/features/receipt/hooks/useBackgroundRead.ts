// b8-rxweb: the background read as React state (docs/dev/design/b8-rxweb.md). Given a Shop, only a read of that Shop is shown.
import { useSyncExternalStore } from 'react'
import { type BackgroundRead, getBackgroundRead, subscribeBackgroundRead } from '../lib/backgroundRead'

export function useBackgroundRead(shopId?: number): BackgroundRead | undefined {
  const state = useSyncExternalStore(subscribeBackgroundRead, getBackgroundRead, getBackgroundRead)
  if (shopId === undefined || state === undefined || state.shopId === shopId) return state
  return undefined
}
