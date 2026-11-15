// B9-28 (RX-01): "Go to the first question" and "Next question". The questions come from lib/reviewSummary.openQuestions, in page order; each
// question's row carries `data-question` on the element that takes focus (a row title, or the wrapper of a question tile).
import { useCallback, useMemo, useRef, type RefObject } from 'react'
import type { Question } from '../lib/reviewSummary'

export interface UseQuestionJump {
  /** Moves focus to the first open question. */
  goToFirst: () => void
  /** Moves focus to the first open question after the one that has focus, wrapping around. */
  next: () => void
}

/** The question ids in page order, each once (a unit question shares its Ingredient's row). */
export function questionTargets(questions: readonly Question[]): string[] {
  return [...new Set(questions.map((q) => q.id))]
}

/** The id after `current` in `ids`, wrapping around; the first id when `current` is none of them. */
export function nextTarget(ids: readonly string[], current: string | undefined): string | undefined {
  if (ids.length === 0) return undefined
  const at = current === undefined ? -1 : ids.indexOf(current)
  return ids[(at + 1) % ids.length]
}

const TAKE_OVER = 'takeover-'

function targetOf(root: HTMLElement, id: string): HTMLElement | null {
  const find = (key: string) => root.querySelector<HTMLElement>(`[data-question="${CSS.escape(key)}"]`)
  // A take-over ask that sits on its Base recipe line's tile is reached through that tile.
  return find(id) ?? (id.startsWith(TAKE_OVER) ? find(id.slice(TAKE_OVER.length)) : null)
}

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useQuestionJump(root: RefObject<HTMLElement | null>, questions: readonly Question[]): UseQuestionJump {
  const ids = useMemo(() => questionTargets(questions), [questions])
  // The question the last jump landed on: pressing "Next question" moves focus to the bar's button before it runs.
  const last = useRef<string | undefined>(undefined)
  const go = useCallback(
    (id: string | undefined) => {
      const el = id && root.current ? targetOf(root.current, id) : null
      if (!el) return
      last.current = id
      el.scrollIntoView?.({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' })
      el.focus({ preventScroll: true })
    },
    [root],
  )
  const goToFirst = useCallback(() => go(ids[0]), [go, ids])
  const next = useCallback(() => {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Focus on a question's title or tile, or on a control of its row (an answer chip, the unit field).
    const holder = active?.closest<HTMLElement>('[data-question]') ?? active?.closest('.list-row')?.querySelector<HTMLElement>('[data-question]')
    const current = holder?.dataset.question ?? last.current
    go(nextTarget(ids, current))
  }, [go, ids])
  return { goToFirst, next }
}
