import type { Member, MemberInput } from '../types'

export interface MembersState {
  members: Member[]
  isPending: boolean
  isError: boolean
  create: (input: MemberInput) => Promise<Member>
  update: (id: number, input: MemberInput) => Promise<Member>
  /** Also refreshes Meal Slots, whose Attendance and portions change. */
  remove: (id: number) => Promise<void>
  linkUser: (id: number, userId: number | null) => Promise<Member>
  saving: boolean
}

export function useMembers(): MembersState {
  throw new Error('not implemented')
}
