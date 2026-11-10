import type { AccessRequest } from '../types'

export interface AccessRequestsState {
  requests: AccessRequest[]
  isPending: boolean
  isError: boolean
  approve: (id: number) => Promise<unknown>
  deny: (id: number) => Promise<unknown>
}

/** The pending Access Requests with approve and deny. Any signed-in User may use it. Refetches on the "access" live event. */
export function useAccessRequests(): AccessRequestsState {
  const never = () => Promise.reject(new Error('not implemented'))
  return { requests: [], isPending: false, isError: false, approve: never, deny: never }
}
