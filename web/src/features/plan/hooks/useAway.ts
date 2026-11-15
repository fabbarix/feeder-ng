// B9-46 (PC-08): the Away writes. Each is one call; the server replans once and answers with the changes and the Undo's token; the
// plan and every Member's Aways are read again.
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { planApi, type AwayAnswer } from '../api'
import type { PlanChange } from '../lib/replan'
import type { Away, AwayPreview } from '../types'

export interface AwayWrite {
  away: Away
  changes: PlanChange[]
  undoToken?: string
}
export interface UseAway {
  /** `?dryRun=1`: POST /api/members/{id}/away, or PATCH /api/away/{id} when `awayId` is given. */
  preview: (memberId: number, body: Record<string, unknown>, awayId?: number) => Promise<AwayPreview>
  create: (memberId: number, body: Record<string, unknown>) => Promise<AwayWrite>
  update: (awayId: number, body: Record<string, unknown>) => Promise<AwayWrite>
  end: (awayId: number) => Promise<AwayWrite>
  remove: (awayId: number) => Promise<{ id: number; changes: PlanChange[]; undoToken?: string }>
  saving: boolean
}

const split = ({ changes, undoToken, ...away }: AwayAnswer): AwayWrite => ({ away, changes: changes ?? [], undoToken })

export function useAway(): UseAway {
  const client = useQueryClient()
  const [saving, setSaving] = useState(false)

  /** Runs a write, then reads the plan, the Aways and Who's eating again (also after a refusal: something may have moved). */
  const write = useCallback(
    async <T,>(call: () => Promise<T>): Promise<T> => {
      setSaving(true)
      try {
        return await call()
      } finally {
        setSaving(false)
        await Promise.all([
          client.invalidateQueries({ queryKey: ['plan'] }),
          client.invalidateQueries({ queryKey: ['household', 'away'] }),
          client.invalidateQueries({ queryKey: ['household', 'attendance'] }),
        ])
      }
    },
    [client],
  )

  const ops = useMemo<Omit<UseAway, 'saving'>>(
    () => ({
      preview: (memberId, body, awayId) => planApi.awayPreview(memberId, body, awayId),
      create: (memberId, body) => write(() => planApi.createAway(memberId, body)).then(split),
      update: (awayId, body) => write(() => planApi.updateAway(awayId, body)).then(split),
      end: (awayId) => write(() => planApi.endAway(awayId)).then(split),
      remove: (awayId) => write(() => planApi.removeAway(awayId)).then((r) => ({ ...r, changes: r.changes ?? [] })),
    }),
    [write],
  )
  return { ...ops, saving }
}
