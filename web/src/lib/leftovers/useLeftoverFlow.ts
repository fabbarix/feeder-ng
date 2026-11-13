// The Leftover flow of one screen: which sheet is open, the Leftover details, the answer waiting for a yes, and the calls.
// React-facing state only: the rules are in sheetModel, the copy in copy, the requests in api.
import { useState } from 'react'
import { useConfirm } from '../../ui/ConfirmDialog'
import { leftoversApi } from './api'
import { answerLabel, answerTitle } from './copy'
import { replannedNotes } from './sheetModel'
import { useLeftoverSheetContext, type LeftoverSheetContext } from './useLeftoverSheetContext'
import { useLeftoverActions, useLeftovers } from './useLeftoverActions'
import type { Leftover, LeftoverActionKind, LeftoverAnswer, LeftoverRequest, PlannedMealRef } from './types'

export interface OpenLeftoverSheet {
  action: LeftoverActionKind
  leftover: Leftover
}

export interface LeftoverFlow {
  today: string
  /** Every Leftover with portions left (the Pantry and the Plan filter them). */
  leftovers: Leftover[]
  sheet: OpenLeftoverSheet | null
  /** The Leftover whose details sheet is open ("From Mon's Chilli"), or null. */
  details: Leftover | null
  context: LeftoverSheetContext
  busy: boolean
  openSheet: (action: LeftoverActionKind, leftover: Leftover) => void
  closeSheet: () => void
  /** Runs the open sheet's request; closes it on success, keeps it open (with the error toast) on failure. */
  confirm: (request: LeftoverRequest) => Promise<void>
  openDetails: (leftoverId: number) => void
  closeDetails: () => void
  /**
   * A question's answer: dry runs "all of it" first. When Planned Meals would be replanned, the shared confirm names them
   * ("Replan for Chilli?", danger for Threw it out) and the answer goes only after a yes; else it answers at once.
   */
  answer: (leftover: Leftover, answer: LeftoverAnswer) => Promise<void>
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
  const confirm = useConfirm()
  const [sheet, setSheet] = useState<OpenLeftoverSheet | null>(null)
  const [detailsId, setDetailsId] = useState<number | null>(null)
  const recipeId = sheet?.leftover.recipeId ?? null
  const context = useLeftoverSheetContext(recipeId)
  const details = detailsId === null ? null : (leftovers.find((l) => l.id === detailsId) ?? null)

  return {
    today,
    leftovers,
    sheet,
    details,
    context,
    busy: actions.busy,
    openSheet: (action, leftover) => {
      setDetailsId(null)
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
      if (replanned.length > 0) {
        const yes = await confirm.confirm({
          title: answerTitle(leftover.recipeName),
          body: replannedNotes(replanned)
            .map((n) => n.text)
            .join(' '),
          confirmLabel: answerLabel(answer),
          tone: answer === 'threw_out' ? 'danger' : 'default',
        })
        if (!yes) return
      }
      await actions.answer(leftover, answer)
    },
  }
}
