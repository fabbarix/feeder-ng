import { useQueryClient } from '@tanstack/react-query'
import { http } from '../lib/http'
import { SignedOut } from '../features/signin/components/SignedOut'
import type { ShellStatusHook } from './features'
import { AppShell } from './AppShell'
import type { NavItem } from './nav'
import { shellStrings } from './strings'
import { ME_QUERY_KEY, useMe } from './useMe'

export interface AppRootProps {
  navItems?: NavItem[]
  /** The features' useShellStatus hooks (collectFeatures().statusHooks). */
  statusHooks?: ShellStatusHook[]
}

/** Gatekeeper: shows the shell for a signed-in User, and a signed-out page otherwise. */
export function AppRoot({ navItems, statusHooks = [] }: AppRootProps) {
  const me = useMe()
  const queryClient = useQueryClient()
  // The statusHooks list comes from the eager glob, so it is fixed for the app's life: calling the hooks in a loop
  // keeps their order stable from render to render. They run before the early returns below, so every render calls them.
  let pendingScans = 0
  for (const useStatus of statusHooks) {
    pendingScans += useStatus().pendingScans ?? 0
  }

  if (me.isPending) return <p role="status">{shellStrings.loading}</p>
  if (me.isError) return <p role="alert">{shellStrings.loadError}</p>
  if (!me.data) return <SignedOut />

  const signOut = async () => {
    await http.post('/api/logout')
    queryClient.setQueryData(ME_QUERY_KEY, null)
  }
  return (
    <AppShell
      user={{ displayName: me.data.displayName }}
      onSignOut={signOut}
      navItems={navItems}
      pendingScans={pendingScans}
    />
  )
}
