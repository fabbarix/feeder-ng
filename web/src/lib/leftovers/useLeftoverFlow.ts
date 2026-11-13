// The Leftover flow of one screen: which sheet is open, the Leftover details, the answer waiting for a yes, and the calls.
// React-facing state only: the rules are in sheetModel, the copy in copy, the requests in api.
import { useState } from 'react'
import { leftoversApi } from './api'
import { useLeftoverSheetContext, type LeftoverSheetContext } from './useLeftoverSheetContext'
import { useLeftoverActions, useLeftovers } from './useLeftoverActions'
import type { Leftover, LeftoverActionKind, LeftoverAnswer, LeftoverRequest, PlannedMealRef } from './types'

export interface OpenLeftoverSheet {
  action: LeftoverActionKind
  leftover: Leftover
}

/** An answer the server says would replan Planned Meals: the sheet names them, and answers only after a yes. */
export interface AskedAnswer {
  leftover: Leftover
  answer: LeftoverAnswer
  replanned: PlannedMealRef[]
}

export interface LeftoverFlow {
  today: string
  /** Every Leftover with portions left (the Pantry and the Plan filter them). */
  leftovers: Leftover[]
  sheet: OpenLeftoverSheet | null
  /** The Leftover whose details sheet is open ("From Mon's Chilli"), or null. */
  details: Leftover | null
  asked: AskedAnswer | null
  context: LeftoverSheetContext
  busy: boolean
  openSheet: (action: LeftoverActionKind, leftover: Leftover) => void
  closeSheet: () => void
  /** Runs the open sheet's request; closes it on success, keeps it open (with the error toast) on failure. */
  confirm: (request: LeftoverRequest) => Promise<void>
  openDetails: (leftoverId: number) => void
  closeDetails: () => void
  /** A question's answer: dry runs "all of it" first; asks when Planned Meals would be replanned, else answers at once. */
  answer: (leftover: Leftover, answer: LeftoverAnswer) => Promise<void>
  confirmAnswer: () => Promise<void>
  cancelAnswer: () => void
}

/** The dry run of an answer: had-it with every portion left (the same Planned Meals lose out). A failed dry run answers anyway. */
async function previewAnswer(leftover: Leftover): Promise<PlannedMealRef[]> {
  try {
    return await leftoversApi.preview(leftover.id, { kind: 'had-it', portions: leftover.portions })
  } catch {
    return []
  }
}

export function useLeftoverFlow(today: string): LeftoverFlow {
  const { leftovers } = useLeftovers()
  const actions = useLeftoverActions({ today })
  const [sheet, setSheet] = useState<OpenLeftoverSheet | null>(null)
  const [detailsId, setDetailsId] = useState<number | null>(null)
  const [asked, setAsked] = useState<AskedAnswer | null>(null)
  const recipeId = (sheet?.leftover ?? asked?.leftover ?? null)?.recipeId ?? null
  const context = useLeftoverSheetContext(recipeId)
  const details = detailsId === null ? null : (leftovers.find((l) => l.id === detailsId) ?? null)

  return {
    today,
    leftovers,
    sheet,
    details,
    asked,
    context,
    busy: actions.busy,
    openSheet: (action, leftover) => {
      setDetailsId(null)
      setAsked(null)
      setSheet({ action, leftover })
    },
    closeSheet: () => setSheet(null),
    confirm: async (request) => {
      if (!sheet) return
      if (await actions.run(sheet.leftover, request)) setSheet(null)
    },
    openDetails: (id) => {
      setSheet(null)
      setDetailsId(id)
    },
    closeDetails: () => setDetailsId(null),
    answer: async (leftover, answer) => {
      const replanned = await previewAnswer(leftover)
      if (replanned.length === 0) {
        await actions.answer(leftover, answer)
        return
      }
      setAsked({ leftover, answer, replanned })
    },
    confirmAnswer: async () => {
      if (!asked) return
      const { leftover, answer } = asked
      setAsked(null)
      await actions.answer(leftover, answer)
    },
    cancelAnswer: () => setAsked(null),
  }
}
