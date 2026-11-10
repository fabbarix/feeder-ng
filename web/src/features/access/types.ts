/** One pending Access Request as GET /api/access-requests returns it. Name and picture come from Google (untrusted text). */
export interface AccessRequest {
  id: number
  email: string
  name: string
  /** https Google avatar URL, or ''. */
  picture: string
  /** ISO instants. */
  requestedAt: string
  expiresAt: string
}

export interface AccessRequestList {
  requests: AccessRequest[]
  count: number
}

export interface AccessEvent {
  kind: 'requested' | 'approved' | 'denied' | 'expired'
  email: string
  name: string
  at: string
  /** Who approved or denied; '' for requested and expired. */
  actorEmail: string
  /** The Member the approval linked the new User to (decision A3); '' or absent when none. */
  memberName?: string
}

/** A Member as GET /api/members returns it; the approve sheet offers those with `userId === null`. */
export interface AccessMember {
  id: number
  name: string
  avatar?: string
  userId: number | null
}

/** What the waiting page may know: only the visitor's own Google details. */
export interface WaitingStatus {
  status: 'pending' | 'none'
  email?: string
  name?: string
  requestedAt?: string
}

/** Which message the waiting page shows: waiting (default), limited (try again later) or full (queue is full). */
export type WaitingKind = 'waiting' | 'limited' | 'full'
