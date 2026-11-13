import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../../lib/http'
import { actionError } from '../../../lib/leftovers/copy'
import type { Leftover } from '../../../lib/leftovers/types'
import { useToast } from '../../../ui'
import { planApi } from '../api'
import type { SlotKey } from '../types'
import { invalidatePlan } from './planCache'

const errorShape = (err: unknown): { status?: number; code?: string } => (err instanceof ApiError ? { status: err.status, code: err.code } : {})

/**
 * "From the freezer": pins a frozen Leftover to the Planned Meal of a Course. A refusal (past its Use-by, too few portions)
 * is a toast naming the Recipe; the plan refetches either way. Resolves true when the Leftover was picked.
 */
export function usePickLeftover(): (key: SlotKey, leftover: Pick<Leftover, 'id' | 'recipeName'>) => Promise<boolean> {
  const client = useQueryClient()
  const toast = useToast()
  return useCallback(
    async (key, leftover) => {
      try {
        await planApi.pickLeftover(key, leftover.id)
        await invalidatePlan(client)
        return true
      } catch (err) {
        toast.show(actionError(errorShape(err), leftover.recipeName), { status: 'error' })
        await invalidatePlan(client)
        return false
      }
    },
    [client, toast],
  )
}
