import { useQueryClient } from '@tanstack/react-query'
import { http } from '../lib/http'
import { SignedOut } from '../features/signin/components/SignedOut'
import { forgetStoredPhotos } from '../features/import'
import { ReceiptReadWatcher } from '../features/receipt/components/ReceiptReadWatcher'
import { resetBackgroundRead } from '../features/receipt/lib/backgroundRead'
import { SyncQueueProvider } from '../features/scan/components/SyncQueueProvider'
import { clearCachedMe } from './meCache'
import type { ShellStatusHook } from './features'
import { AppShell } from './AppShell'
import type { NavItem } from './nav'
import { FirstLaunchFailed, FirstLaunchWaiting } from './FirstLaunch'
import { ME_QUERY_KEY, useMe, useRecoverMeOnline } from './useMe'
import { useServiceWorkerNavigate } from './useServiceWorkerNavigate'
import { useShellStatus } from './useShellStatus'

export interface AppRootProps {
  navItems?: NavItem[]
  /** The features' useShellStatus hooks (collectFeatures().statusHooks). */
  statusHooks?: ShellStatusHook[]
  /** B9-59: prefetches a route's code when its nav link is pressed or focused. */
  onNavIntent?: (path: string) => void
}

/** Gatekeeper: shows the shell for a signed-in User, and a signed-out page otherwise. */
export function AppRoot({ navItems, statusHooks = [], onNavIntent }: AppRootProps) {
  const me = useMe()
  useRecoverMeOnline(me)
  const queryClient = useQueryClient()
  // The statusHooks list comes from the eager glob, so it is fixed for the app's life: useShellStatus calls them in a loop in a
  // stable order. They run before the early returns below, so every render calls them.
  const { pendingScans, pendingTicks, pendingAccessRequests } = useShellStatus(statusHooks)
  // TB-14: a notification click the service worker hands to this window moves the router (no reload).
  useServiceWorkerNavigate()

  // B9-20: a remembered User opens the shell at once, and a failing /api/me never replaces it (data wins over the error).
  if (me.data === undefined) {
    if (me.isError) return <FirstLaunchFailed onRetry={() => void me.refetch()} />
    return <FirstLaunchWaiting />
  }
  if (!me.data) return <SignedOut />

  const signOut = async () => {
    clearCachedMe() // forget the remembered User first: signing out must never leave it behind
    resetBackgroundRead() // a receipt read in the background is this User's: it stops being followed, and its kept result goes
    try {
      await forgetStoredPhotos() // the photos kept on the device for a photo read go too
    } catch {
      // a failure never blocks sign-out
    }
    await http.post('/api/logout')
    queryClient.setQueryData(ME_QUERY_KEY, null)
  }
  // The receipt read goes on in the background while a User is signed in; the watcher (one, above both shell frames) says when it ends.
  // B9-54 (RES-03): the one offline queue of Scans and Ticks, for every screen of a signed-in User (it syncs wherever the User is).
  return (
    <SyncQueueProvider>
      <ReceiptReadWatcher />
      <AppShell
        user={{ displayName: me.data.displayName }}
        onSignOut={signOut}
        navItems={navItems}
        pendingScans={pendingScans}
        pendingTicks={pendingTicks}
        pendingAccessRequests={pendingAccessRequests}
        onNavIntent={onNavIntent}
      />
    </SyncQueueProvider>
  )
}
