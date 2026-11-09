import type { AllowedUser } from '../types'

export interface AllowlistState {
  users: AllowedUser[]
  isPending: boolean
  isError: boolean
  add: (email: string) => Promise<AllowedUser>
  setAdmin: (id: number, isAdmin: boolean) => Promise<AllowedUser>
  remove: (id: number) => Promise<void>
}

/** Only Admins may read the allowlist: with enabled=false nothing is fetched. */
export function useAllowlist(_enabled: boolean): AllowlistState {
  throw new Error('not implemented')
}
