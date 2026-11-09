import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '../api'
import type { Member, MemberInput } from '../types'
import { settingsKeys } from './queryKeys'

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

const NO_MEMBERS: Member[] = []

export function useMembers(): MembersState {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: settingsKeys.members, queryFn: settingsApi.listMembers })
  const refreshMembers = () => queryClient.invalidateQueries({ queryKey: settingsKeys.members })
  const refreshAll = async () => {
    await Promise.all([refreshMembers(), queryClient.invalidateQueries({ queryKey: settingsKeys.slots })])
  }
  const create = useMutation({ mutationFn: settingsApi.createMember, onSuccess: refreshMembers })
  const update = useMutation({
    mutationFn: ({ id, input }: { id: number; input: MemberInput }) => settingsApi.updateMember(id, input),
    onSuccess: refreshAll,
  })
  const remove = useMutation({ mutationFn: settingsApi.deleteMember, onSuccess: refreshAll })
  const link = useMutation({
    mutationFn: ({ id, userId }: { id: number; userId: number | null }) => settingsApi.linkMemberUser(id, userId),
    onSuccess: refreshMembers,
  })
  return {
    members: query.data ?? NO_MEMBERS,
    isPending: query.isPending,
    isError: query.isError,
    create: create.mutateAsync,
    update: (id, input) => update.mutateAsync({ id, input }),
    remove: remove.mutateAsync,
    linkUser: (id, userId) => link.mutateAsync({ id, userId }),
    saving: create.isPending || update.isPending || remove.isPending || link.isPending,
  }
}
