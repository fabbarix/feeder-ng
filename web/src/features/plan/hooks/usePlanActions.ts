import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { planApi } from '../api'
import type { SlotDayKey, SlotKey } from '../types'
import { invalidatePlan } from './planCache'

export interface UsePlanActions {
  /** Redoes the unpinned Planned Meals; resolves true when the plan was regenerated. */
  regenerate: () => Promise<boolean>
  regenerating: boolean
  /** Sets the Recipe of a slot (and pins it, on the server). Resolves true on success. */
  setMeal: (key: SlotKey, recipeId: number) => Promise<boolean>
  /** Pin the Planned Meal (POST .../confirm on the server; the UI word is Pin). */
  pin: (key: SlotKey) => Promise<boolean>
  unpin: (key: SlotKey) => Promise<boolean>
  /** Undo of a Swap: the previous Recipe back, unpinned again when it was not Pinned before. */
  restore: (key: SlotKey, recipeId: number, pinned: boolean) => Promise<boolean>
  /** CRS F: POST .../all/not-cooked for the slot (Not cooked: whole slot), then the plan refetches. Resolves true on success. */
  notCookedSlot: (slot: SlotDayKey) => Promise<boolean>
  /** Message of the last failed action, or null. */
  error: string | null
}

/** Mutations on the plan; each invalidates ['plan'] on success. */
export function usePlanActions(): UsePlanActions {
  const client = useQueryClient()
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (call: () => Promise<unknown>): Promise<boolean> => {
      setError(null)
      try {
        await call()
        await invalidatePlan(client)
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        await invalidatePlan(client)
        return false
      }
    },
    [client],
  )

  const regenerate = useCallback(async () => {
    setRegenerating(true)
    try {
      return await run(() => planApi.regenerate())
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
    restore: (key, recipeId, pinned) =>
      run(async () => {
        await planApi.setMeal(key, recipeId)
        if (!pinned) await planApi.unpin(key)
      }),
    notCookedSlot: (slot) => run(() => planApi.notCookedAll(slot)),
    error,
  }
}
