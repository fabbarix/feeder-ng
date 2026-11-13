// The Leftovers query and the hand actions (react-query). Not exported from the pure barrel index.ts.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../http'
import { useToast } from '../../ui/Toast'
import { leftoversApi } from './api'
import { actionError, answerToast, freezeToast, hadItToast, leftoverStrings, takeOutToast, threwOutToast } from './copy'
import { leftoverKeys } from './queryKeys'
import type { Leftover, LeftoverAnswer, LeftoverRequest } from './types'

export interface LeftoversState {
  leftovers: Leftover[]
  isPending: boolean
  isError: boolean
}

/** `GET /api/plan/leftovers` under the key the plan feature already uses (`['plan', 'leftovers']`). */
export function useLeftovers(): LeftoversState {
  const query = useQuery({ queryKey: leftoverKeys.list, queryFn: leftoversApi.list })
  return { leftovers: query.data ?? [], isPending: query.isPending, isError: query.isError }
}

export interface LeftoverActions {
  /**
   * Runs the confirmed sheet. On success: toast (copy.ts), refresh Leftovers, the plan and the Pantry, resolve true.
   * On failure: an error toast with `actionError`, nothing refreshed, resolve false.
   */
  run: (leftover: Pick<Leftover, 'id' | 'recipeName'>, request: LeftoverRequest) => Promise<boolean>
  /** The three buttons of the question row. Same toast and refresh rules. */
  answer: (leftover: Pick<Leftover, 'id' | 'recipeName'>, answer: LeftoverAnswer) => Promise<boolean>
  /** True while a call is in flight (disables the sheet's confirm button). */
  busy: boolean
}

type Target = Pick<Leftover, 'id' | 'recipeName'>
type Job = { leftover: Target; request: LeftoverRequest } | { leftover: Target; answer: LeftoverAnswer }

/** Makes the call and returns the toast line for it. */
async function perform(job: Job, today: string): Promise<string> {
  const { leftover } = job
  if ('answer' in job) {
    await leftoversApi.answer(leftover.id, job.answer)
    return answerToast(leftover.recipeName, job.answer)
  }
  const r = job.request
  switch (r.kind) {
    case 'had-it': {
      const out = await leftoversApi.hadIt(leftover.id, r.portions)
      return hadItToast(leftover.recipeName, r.portions, out.portions)
    }
    case 'threw-out':
      await leftoversApi.threwOut(leftover.id, r.portions)
      return threwOutToast(leftover.recipeName, r.portions)
    case 'freeze': {
      const out = await leftoversApi.freeze(leftover.id, r.storagePlaceId, r.portions)
      return freezeToast(leftover.recipeName, out.frozen.storagePlaceName ?? leftoverStrings.notSorted, out.frozen.useBy, today)
    }
    case 'take-out': {
      const out = await leftoversApi.takeOut(leftover.id, r.storagePlaceId)
      return takeOutToast(leftover.recipeName, out.useBy, today)
    }
  }
}

const errorShape = (err: unknown): { status?: number; code?: string } =>
  err instanceof ApiError ? { status: err.status, code: err.code } : {}

export function useLeftoverActions({ today }: { today: string }): LeftoverActions {
  const client = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const settle = async (job: Job): Promise<boolean> => {
    setBusy(true)
    try {
      const message = await perform(job, today)
      toast.show(message, { status: 'success' })
      // The plan key covers the Leftovers list; the Pantry and waste live under 'stock'.
      void client.invalidateQueries({ queryKey: ['plan'] })
      void client.invalidateQueries({ queryKey: ['stock'] })
      return true
    } catch (err) {
      toast.show(actionError(errorShape(err), job.leftover.recipeName), { status: 'error' })
      return false
    } finally {
      setBusy(false)
    }
  }

  return {
    run: (leftover, request) => settle({ leftover, request }),
    answer: (leftover, answer) => settle({ leftover, answer }),
    busy,
  }
}
