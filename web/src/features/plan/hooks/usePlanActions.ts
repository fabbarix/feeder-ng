import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { planApi } from '../api'
import type { SlotKey } from '../types'
import { invalidatePlan } from './planCache'

export interface UsePlanActions {
  regenerate: () => Promise<void>
  regenerating: boolean
  setMeal: (key: SlotKey, recipeId: number) => Promise<void>
  /** Pin the Planned Meal (POST .../confirm on the server; the UI word is Pin). Replaces `confirm`. */
  pin: (key: SlotKey) => Promise<void>
  unpin: (key: SlotKey) => Promise<void>
  /** Message of the last failed action, or null. */
  error: string | null
}

/** Mutations on the plan; each invalidates ['plan'] on success. */
export function usePlanActions(): UsePlanActions {
  const client = useQueryClient()
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (call: () => Promise<unknown>) => {
      setError(null)
      try {
        await call()
        await invalidatePlan(client)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        await invalidatePlan(client)
      }
    },
    [client],
  )

  const regenerate = useCallback(async () => {
    setRegenerating(true)
    try {
      await run(() => planApi.regenerate())
    } finally {
      setRegenerating(false)
    }
  }, [run])

  return {
    regenerate,
    regenerating,
    setMeal: (key, recipeId) => run(() => planApi.setMeal(key, recipeId)),
    pin: (key) => run(() => planApi.confirm(key)),
    unpin: (key) => run(() => planApi.unpin(key)),
    error,
  }
}
