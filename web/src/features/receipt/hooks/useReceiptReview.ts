// The Receipt review's state and the apply, over the kept read (design 3.4, 7.2, 9). Nothing is written until the apply succeeds.
import { useCallback, useMemo, useRef, useState } from 'react'
import { useMe } from '../../../app/useMe'
import { receiptApi } from '../api'
import { emitReceiptApplied } from '../lib/appliedEvents'
import { describeReceiptError } from '../lib/receiptErrors'
import { forgetRead, recallRead } from '../lib/readStore'
import { getReceiptSession } from '../lib/receiptSession'
import {
  acceptAll as acceptAllRows,
  allAccepted as isAllAccepted,
  applyCount as countApplied,
  buildApplyBody,
  buildSections,
  clearAll as clearAllRows,
  initialReview,
  setAdd as setAddDraft,
  toggle as toggleRow,
} from '../lib/reviewState'
import type { AddDraft, ReceiptErrorAction, ReceiptRow, ReviewSection, ReviewState, StoredRead } from '../types'

export interface ReviewError {
  code: string
  message: string
  action: ReceiptErrorAction
  /** The row the server means (422 unknown_proposal, add_incomplete). */
  id?: string
}

export interface UseReceiptReviewOptions {
  /** Called with the server's count after a successful apply. */
  onApplied: (applied: number) => void
}

export interface UseReceiptReview {
  stored?: StoredRead
  rows: ReceiptRow[]
  sections: ReviewSection[]
  state: ReviewState
  applyCount: number
  /** Every row that needs no choice is checked: the button then reads "Clear all". */
  allAccepted: boolean
  /** Something is checked: leaving asks first. */
  hasChecked: boolean
  toggle(id: string): void
  setAdd(id: string, draft: AddDraft): void
  acceptAll(): void
  clearAll(): void
  applying: boolean
  apply(): Promise<void>
  error?: ReviewError
  highlightId?: string
  dismissError(): void
  /** Forgets the kept read; the screen then goes back to the photos. */
  readAgain(): void
}

export function useReceiptReview({ onApplied }: UseReceiptReviewOptions): UseReceiptReview {
  const me = useMe()
  const isAdmin = me.data?.isAdmin === true
  const [stored, setStored] = useState<StoredRead | undefined>(() => recallRead())
  const [state, setState] = useState<ReviewState>(() => initialReview(stored?.read.proposals ?? []))
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<ReviewError>()
  const applyingRef = useRef(false)

  const proposals = useMemo(() => stored?.read.proposals ?? [], [stored])
  const sections = useMemo(() => buildSections(proposals), [proposals])
  const applyCount = countApplied(state, proposals)

  const toggle = useCallback((id: string) => setState((s) => toggleRow(s, id)), [])
  const setAdd = useCallback((id: string, draft: AddDraft) => setState((s) => setAddDraft(s, id, draft)), [])
  const acceptAll = useCallback(() => setState((s) => acceptAllRows(s, proposals)), [proposals])
  const clearAll = useCallback(() => setState((s) => clearAllRows(s)), [])

  const apply = useCallback(async () => {
    if (!stored || applyingRef.current) return
    const body = buildApplyBody({
      readId: stored.readId,
      fingerprint: stored.read.fingerprint,
      clientUuids: getReceiptSession()?.clientUuids ?? stored.clientUuids,
      proposals,
      state,
    })
    if (body.accept.length === 0) return
    applyingRef.current = true
    setApplying(true)
    setError(undefined)
    const out = await receiptApi.apply(body)
    applyingRef.current = false
    setApplying(false)
    if (out.ok) {
      emitReceiptApplied({ readId: stored.readId, applied: out.applied, failed: false, results: out.results, undone: out.undone })
      forgetRead()
      setStored(undefined)
      onApplied(out.applied)
      return
    }
    // A failed put-back still re-keys the Scanned list: its results go over, and the read is stale now.
    if (out.code === 'receipt_apply_failed') emitReceiptApplied({ readId: stored.readId, applied: 0, failed: true, results: out.results })
    const copy = describeReceiptError({ code: out.code }, { isAdmin })
    setError({ code: out.code, message: copy.message, action: copy.action, ...(out.id !== undefined ? { id: out.id } : {}) })
  }, [stored, proposals, state, isAdmin, onApplied])

  const dismissError = useCallback(() => setError(undefined), [])

  const readAgain = useCallback(() => {
    forgetRead()
    setStored(undefined)
  }, [])

  return {
    stored,
    rows: stored?.read.rows ?? [],
    sections,
    state,
    applyCount,
    allAccepted: isAllAccepted(state, proposals),
    hasChecked: applyCount > 0,
    toggle,
    setAdd,
    acceptAll,
    clearAll,
    applying,
    apply,
    error,
    highlightId: error?.id,
    dismissError,
    readAgain,
  }
}
