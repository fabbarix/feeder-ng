import { useQueryClient } from '@tanstack/react-query'
import { http } from '../lib/http'
import { SignedOut } from '../features/signin/components/SignedOut'
import { AppShell } from './AppShell'
import type { NavItem } from './nav'
import { shellStrings } from './strings'
import { ME_QUERY_KEY, useMe } from './useMe'

export interface AppRootProps {
  navItems?: NavItem[]
}

/** Gatekeeper: shows the shell for a signed-in User, and a signed-out page otherwise. */
export function AppRoot({ navItems }: AppRootProps) {
  const me = useMe()
  const queryClient = useQueryClient()

  if (me.isPending) return <p role="status">{shellStrings.loading}</p>
  if (me.isError) return <p role="alert">{shellStrings.loadError}</p>
  if (!me.data) return <SignedOut />

  const signOut = async () => {
    await http.post('/api/logout')
    queryClient.setQueryData(ME_QUERY_KEY, null)
  }
  return <AppShell user={{ displayName: me.data.displayName }} onSignOut={signOut} navItems={navItems} />
}
