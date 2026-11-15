// SAFE R1 (B9-18): the one way a screen shows "<thing> done" with an Undo. The toast has no status icon (R-D+), carries the Undo
// as its last action (role 'undo': 8 s, paused on hover, focus and a hidden page, the Ctrl+Z / Cmd+Z target) and keeps the round
// Dismiss. Undo runs once; success can say "<thing> is back" for 4 s; a refusal says what did not happen and stays (PC-01 mock:
// "Nothing was undone", the reason as the subline, the error icon in the headline line).
import { useCallback, useMemo } from 'react'
import { ApiError } from '../lib/http'
import { useToast, type ToastAction, type ToastActionContext, type ToastHandle } from './Toast'

export interface UndoToastInput {
  /** Past tense, naming the thing: "Sam removed". */
  headline: string
  /** The rich anatomy (R-D); omitted, the toast is one line. */
  subline?: string
  body?: string
  /** The inverse. Rejects (or throws) when the server refuses. Run at most once. */
  undo: (ctx: ToastActionContext) => unknown
  /** Default "Undo". */
  undoLabel?: string
  /** "Undo: put Sam back". Default "Undo: " and the headline. */
  undoAriaLabel?: string
  /** "Sam is back": a 4 s toast after a successful Undo. Omitted, nothing follows. */
  restored?: string
  /** Extra actions drawn before Undo (Review). They close the toast like any action. */
  actions?: ToastAction[]
  /** Default 8000 (SAFE 5); Scan passes 5000. */
  durationMs?: number
}

export interface UndoToastApi {
  show: (input: UndoToastInput) => ToastHandle
}

export interface UndoRefusal {
  /** Always "Nothing was undone". */
  headline: string
  /** Why: shown as the toast's subline. */
  subline: string
  /** @deprecated the same text as `subline` (the first B9-18 pin named it `body`); use `subline`. */
  body: string
}

export const undoStrings = {
  undo: 'Undo',
  undoAria: (headline: string) => `Undo: ${headline}`,
  refusedHeadline: 'Nothing was undone',
} as const

/** Why an Undo was refused, by ApiError.code; anything else says only that nothing changed. */
const REASONS: Record<string, string> = {
  plan_changed: 'The plan has changed since.',
  leftover_used: 'Some of the Leftover has been used.',
  reopen_window_over: 'It is too late to undo it.',
  window_over: 'It is too late to undo it.',
  undo_window_over: 'It is too late to undo it.',
  not_undoable: 'It cannot be undone.',
  not_found: 'It was already undone.',
  email_taken: 'That email is already used by someone else.',
}
const NOTHING_CHANGED = 'Nothing changed.'

/** The words of a refused Undo. Pure; screens that word their own failures use it too. */
export function undoRefusal(error: unknown): UndoRefusal {
  const reason = (error instanceof ApiError && Object.hasOwn(REASONS, error.code) ? REASONS[error.code] : undefined) ?? NOTHING_CHANGED
  return { headline: undoStrings.refusedHeadline, subline: reason, body: reason }
}

export function useUndoToast(): UndoToastApi {
  const toast = useToast()

  const show = useCallback(
    (input: UndoToastInput): ToastHandle => {
      let ran = false
      const runUndo = async (ctx: ToastActionContext) => {
        if (ran) return
        ran = true
        try {
          await input.undo(ctx)
        } catch (error) {
          const refusal = undoRefusal(error)
          toast.show({ status: 'error', title: refusal.headline, subline: refusal.subline, sticky: true })
          return
        }
        if (input.restored) toast.show({ status: 'success', title: input.restored })
      }
      const undo: ToastAction = {
        label: input.undoLabel ?? undoStrings.undo,
        ariaLabel: input.undoAriaLabel ?? undoStrings.undoAria(input.headline),
        role: 'undo',
        onClick: (ctx) => void runUndo(ctx),
      }
      return toast.show({
        title: input.headline,
        subline: input.subline,
        body: input.body,
        actions: [...(input.actions ?? []), undo],
        durationMs: input.durationMs,
      })
    },
    [toast],
  )

  return useMemo(() => ({ show }), [show])
}
