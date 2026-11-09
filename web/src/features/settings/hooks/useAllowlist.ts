import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '../api'
import type { AllowedUser } from '../types'
import { settingsKeys } from './queryKeys'

export interface AllowlistState {
  users: AllowedUser[]
  isPending: boolean
  isError: boolean
  add: (email: string) => Promise<AllowedUser>
  setAdmin: (id: number, isAdmin: boolean) => Promise<AllowedUser>
  remove: (id: number) => Promise<void>
}

const NO_USERS: AllowedUser[] = []

/** Only Admins may read the allowlist: with enabled=false nothing is fetched. */
export function useAllowlist(enabled: boolean): AllowlistState {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: settingsKeys.allowlist, queryFn: settingsApi.listAllowlist, enabled })
  const refresh = () => queryClient.invalidateQueries({ queryKey: settingsKeys.allowlist })
  const add = useMutation({ mutationFn: (email: string) => settingsApi.addAllowedUser({ email }), onSuccess: refresh })
  const setAdmin = useMutation({
    mutationFn: ({ id, isAdmin }: { id: number; isAdmin: boolean }) => settingsApi.setAdmin(id, isAdmin),
    onSuccess: refresh,
  })
  const remove = useMutation({ mutationFn: settingsApi.removeAllowedUser, onSuccess: refresh })
  return {
    users: query.data ?? NO_USERS,
    isPending: enabled && query.isPending,
    isError: query.isError,
    add: add.mutateAsync,
    setAdmin: (id, isAdmin) => setAdmin.mutateAsync({ id, isAdmin }),
    remove: remove.mutateAsync,
  }
}
