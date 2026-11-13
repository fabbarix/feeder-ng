// The Leftovers query and the hand actions (react-query). Not exported from the pure barrel index.ts.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../http'
import { useToast } from '../../ui/Toast'
import { leftoversApi } from './api'
import { actionError, answerToast, freezeToast, hadItToast, leftoverStrings, takeOutToast, threwOutToast } from './copy'
import { leftoverKeys } from './queryKeys'
import type { Leftover, LeftoverAnswer, LeftoverRequest, PlannedMealRef } from './types'

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

/** What a successful job changed: the toast line, and whether waste was recorded (the streak and the Board then move). */
interface Outcome {
  message: string
  waste: boolean
}

/** Makes the call and returns the toast line for it. */
async function perform(job: Job, today: string): Promise<Outcome> {
  const { leftover } = job
  if ('answer' in job) {
    await leftoversApi.answer(leftover.id, job.answer)
    return { message: answerToast(leftover.recipeName, job.answer), waste: job.answer === 'threw_out' }
  }
  const r = job.request
  switch (r.kind) {
    case 'had-it': {
      const out = await leftoversApi.hadIt(leftover.id, r.portions)
      return { message: hadItToast(leftover.recipeName, r.portions, out.leftover.portions), waste: false }
    }
    case 'threw-out':
      await leftoversApi.threwOut(leftover.id, r.portions)
      return { message: threwOutToast(leftover.recipeName, r.portions), waste: true }
    case 'freeze': {
      const out = await leftoversApi.freeze(leftover.id, r.storagePlaceId, r.portions)
      return { message: freezeToast(leftover.recipeName, out.frozen.storagePlaceName ?? leftoverStrings.notSorted, out.frozen.useBy, today), waste: false }
    }
    case 'take-out': {
      const out = await leftoversApi.takeOut(leftover.id, r.storagePlaceId)
      return { message: takeOutToast(leftover.recipeName, out.useBy, today), waste: false }
    }
  }
}

/** The server dry run for the draft: the Planned Meals that would lose portions. `[]` while loading, for no draft and for Take out. */
export function useReplanPreview(leftoverId: number, request: LeftoverRequest | null): PlannedMealRef[] {
  const dryRun = request !== null && request.kind !== 'take-out' ? request : null
  const query = useQuery({
    queryKey: ['plan', 'replan-preview', leftoverId, dryRun],
    queryFn: () => leftoversApi.preview(leftoverId, dryRun!),
    enabled: dryRun !== null,
  })
  return query.data ?? []
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
      const outcome = await perform(job, today)
      toast.show(outcome.message, { status: 'success' })
      // The plan key covers the Leftovers list; the Pantry lives under 'stock'.
      void client.invalidateQueries({ queryKey: ['plan'] })
      void client.invalidateQueries({ queryKey: ['stock'] })
      if (outcome.waste) {
        // Waste restarts the zero-waste streak and shows on the Board.
        void client.invalidateQueries({ queryKey: ['today', 'streak'] })
        void client.invalidateQueries({ queryKey: ['board'] })
      }
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
