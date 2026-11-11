// Typed calls for Access Requests.
import { http } from '../../lib/http'
import type { AccessEvent, AccessMember, AccessRequest, AccessRequestList, WaitingStatus } from './types'

export interface AllowedUserBody {
  id: number
  email: string
  displayName: string
  isAdmin: boolean
}

export const accessApi = {
  list: () => http.get<AccessRequestList>('/api/access-requests'),
  /** `memberId` links the new User to that unlinked Member in the same step; without it no body is sent. */
  approve: (id: number, memberId?: number) =>
    http.post<AllowedUserBody>(`/api/access-requests/${id}/approve`, memberId === undefined ? undefined : { memberId }),
  members: () => http.get<AccessMember[]>('/api/members'),
  deny: (id: number) => http.post<void>(`/api/access-requests/${id}/deny`),
  history: () => http.get<{ events: AccessEvent[] }>('/api/access-requests/history'),
  waitingStatus: () => http.get<WaitingStatus>('/api/access-request/status'),
}

export type { AccessRequest }
