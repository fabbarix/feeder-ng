import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { ApiError } from '../../../lib/http'
import { importApi } from '../api'
import { answerConversion, chooseCreate, chooseExisting, chooseRecipeAction, emptyDecisions } from '../lib/decisions'
import { readFileError } from '../lib/errors'
import { type PhotoChoice, type PhotoRecipeOption } from '../lib/photoChoice'
import type { AdoptedRead, BaseUnit, Decisions, FileError, ImportResult, Plan, ReadNoteInfo, RecipeAction, ReviewPhoto } from '../types'

export interface UseImportReview {
  phase: 'source' | 'reviewing' | 'done'
  plan: Plan | undefined
  decisions: Decisions
  error: FileError | undefined
  /** True while a request is in flight (opening, re-planning or confirming). */
  busy: boolean
  /** True after a Confirm refused with import_stale. */
  stale: boolean
  result: ImportResult | undefined
  /** Opens the review from the file text; phase becomes 'reviewing', or `error` is set and the phase stays 'source'. */
  open: (text: string) => Promise<void>
  chooseExisting: (key: string, ingredientId: number) => void
  chooseCreate: (key: string, opts?: { name?: string; baseUnit?: BaseUnit }) => void
  answerConversion: (key: string, unit: string, toBase: number) => void
  chooseRecipeAction: (index: number, action: RecipeAction) => void
  /** Saves everything. On success phase becomes 'done' and the Recipe, Ingredient and Tag queries are invalidated. */
  confirm: () => Promise<void>
  /** Discards the server-side review and returns to the source step. */
  reset: () => Promise<void>

  // ---- Recipe Assistant (WP-E / WP-G): docs/dev/design/ra-e-import.md section 5.2 ----
  /** The open review's id (thumbnails are GET /api/imports/{id}/photos/{n}). */
  reviewId: string | undefined
  /** Opens the review a finished read made; no request (the server already opened it). phase becomes 'reviewing'. */
  adopt: (read: AdoptedRead) => void
  /** Candidate photos of a photo read; empty for a file or a text or page read. */
  photos: ReviewPhoto[]
  /** The Recipes that can get a photo (skipped ones left out). */
  photoRecipes: PhotoRecipeOption[]
  photoChoice: PhotoChoice
  setPhotoEnabled: (on: boolean) => void
  choosePhoto: (index: number) => void
  choosePhotoRecipe: (index: number) => void
  /** "Read by Claude Haiku 5.5" / "used the page's recipe data as a hint"; undefined for a file. */
  readNote: ReadNoteInfo | undefined
}

interface Review {
  id: string
  plan: Plan
}

/**
 * Import Review state. Each answer is applied with lib/decisions and sent to `importApi.plan`; the returned
 * plan replaces the shown one (the last request wins). `confirm` sends the current decisions.
 * An import_not_ready answer replaces the plan with the server's; import_stale sets `stale`.
 */
export function useImportReview(): UseImportReview {
  const client = useQueryClient()
  const [phase, setPhase] = useState<UseImportReview['phase']>('source')
  const [review, setReview] = useState<Review | undefined>(undefined)
  const [error, setError] = useState<FileError | undefined>(undefined)
  const [inFlight, setInFlight] = useState(0)
  const [stale, setStale] = useState(false)
  const [result, setResult] = useState<ImportResult | undefined>(undefined)
  const [decisions, setDecisions] = useState<Decisions>(emptyDecisions)

  // Refs mirror the latest values, so answers given in quick succession build on each other.
  const decisionsRef = useRef<Decisions>(decisions)
  const reviewRef = useRef<Review | undefined>(undefined)
  const seq = useRef(0)

  const track = useCallback(async <T,>(work: () => Promise<T>): Promise<T> => {
    setInFlight((n) => n + 1)
    try {
      return await work()
    } finally {
      setInFlight((n) => n - 1)
    }
  }, [])

  const setCurrent = useCallback((r: Review | undefined) => {
    reviewRef.current = r
    setReview(r)
  }, [])

  const open = useCallback(
    async (text: string) => {
      try {
        const res = await track(() => importApi.open(text))
        const next = emptyDecisions()
        decisionsRef.current = next
        setDecisions(next)
        setError(undefined)
        setStale(false)
        setResult(undefined)
        setCurrent({ id: res.id, plan: res.plan })
        setPhase('reviewing')
      } catch (e) {
        setError(readFileError(e))
      }
    },
    [track, setCurrent],
  )

  /** Applies an answer and asks the server for the plan it leads to; only the latest request is shown. */
  const answer = useCallback(
    (next: Decisions) => {
      decisionsRef.current = next
      setDecisions(next)
      const current = reviewRef.current
      if (!current) return
      const mine = ++seq.current
      void track(() => importApi.plan(current.id, next))
        .then((res) => {
          if (mine === seq.current) setCurrent({ id: res.id, plan: res.plan })
        })
        .catch(() => undefined)
    },
    [track, setCurrent],
  )

  const confirm = useCallback(async () => {
    const current = reviewRef.current
    if (!current) return
    try {
      const res = await track(() => importApi.confirm(current.id, decisionsRef.current))
      setResult(res)
      setPhase('done')
      void client.invalidateQueries({ queryKey: ['recipes'] })
      void client.invalidateQueries({ queryKey: ['ingredients'] })
      void client.invalidateQueries({ queryKey: ['tags'] })
    } catch (e) {
      if (e instanceof ApiError && e.code === 'import_not_ready') {
        setCurrent({ id: current.id, plan: e.details.plan as Plan })
      } else if (e instanceof ApiError && e.code === 'import_stale') {
        setStale(true)
      } else {
        setError(readFileError(e))
      }
    }
  }, [track, client, setCurrent])

  const reset = useCallback(async () => {
    const current = reviewRef.current
    if (current) {
      try {
        await importApi.discard(current.id)
      } catch {
        // Already gone (confirmed or expired): nothing to discard.
      }
    }
    setCurrent(undefined)
    decisionsRef.current = emptyDecisions()
    setDecisions(emptyDecisions())
    setError(undefined)
    setStale(false)
    setResult(undefined)
    setPhase('source')
  }, [setCurrent])

  return {
    phase,
    plan: review?.plan,
    decisions,
    error,
    busy: inFlight > 0,
    stale,
    result,
    open,
    chooseExisting: (key, ingredientId) => answer(chooseExisting(decisionsRef.current, key, ingredientId)),
    chooseCreate: (key, opts) => answer(chooseCreate(decisionsRef.current, key, opts)),
    answerConversion: (key, unit, toBase) => answer(answerConversion(decisionsRef.current, key, unit, toBase)),
    chooseRecipeAction: (index, action) => answer(chooseRecipeAction(decisionsRef.current, index, action)),
    confirm,
    reset,
    // TODO(ra-e developer): the Recipe Assistant part (adopt, photos, photoChoice, confirm with `photo`).
    reviewId: review?.id,
    adopt: () => {
      throw new Error('TODO(ra-e developer): not implemented')
    },
    photos: [],
    photoRecipes: [],
    photoChoice: initialPhotoChoice0,
    setPhotoEnabled: () => undefined,
    choosePhoto: () => undefined,
    choosePhotoRecipe: () => undefined,
    readNote: undefined,
  }
}

const initialPhotoChoice0: PhotoChoice = { enabled: false, photo: 0, recipe: 0 }
