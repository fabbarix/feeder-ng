import { useQueryClient } from '@tanstack/react-query'
import { http } from '../lib/http'
import { SignedOut } from '../features/signin/components/SignedOut'
import { forgetStoredPhotos } from '../features/import'
import { ReceiptReadWatcher, resetBackgroundRead } from '../features/receipt'
import { clearCachedMe } from './meCache'
import type { ShellStatusHook } from './features'
import { AppShell } from './AppShell'
import type { NavItem } from './nav'
import { FirstLaunchFailed, FirstLaunchWaiting } from './FirstLaunch'
import { ME_QUERY_KEY, useMe, useRecoverMeOnline } from './useMe'

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
  // The statusHooks list comes from the eager glob, so it is fixed for the app's life: calling the hooks in a loop
  // keeps their order stable from render to render. They run before the early returns below, so every render calls them.
  let pendingScans = 0
  let pendingAccessRequests = 0
  for (const useStatus of statusHooks) {
    const status = useStatus()
    pendingScans += status.pendingScans ?? 0
    pendingAccessRequests += status.pendingAccessRequests ?? 0
  }

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
  return (
    <>
      <ReceiptReadWatcher />
      <AppShell
        user={{ displayName: me.data.displayName }}
        onSignOut={signOut}
        navItems={navItems}
        pendingScans={pendingScans}
        pendingAccessRequests={pendingAccessRequests}
        onNavIntent={onNavIntent}
      />
    </>
  )
}
