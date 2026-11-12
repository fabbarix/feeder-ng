import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useRef, useState } from 'react'
import { ApiError } from '../../../lib/http'
import { importApi } from '../api'
import { answerConversion, chooseCreate, chooseExisting, chooseRecipeAction, emptyDecisions } from '../lib/decisions'
import { readFileError } from '../lib/errors'
import { confirmPhoto, initialPhotoChoice, normaliseChoice, photoRecipes as photoRecipesOf, type PhotoChoice, type PhotoRecipeOption } from '../lib/photoChoice'
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
  /** CRS E2: answers for a Course name of the file (docs/dev/design/crs-e2.md 4.2). Each re-plans like the other answers. */
  chooseCourseUse: (key: string, courseId: number) => void
  chooseCourseSkip: (key: string) => void
  /** Admin only: the server answers 403 to a Confirm that holds it from anyone else. */
  chooseCourseAdd: (key: string) => void
  chooseCourseUnarchive: (key: string) => void
  /** True after a Confirm refused with 403 `forbidden`: the Review stays open, `add` and `unarchive` answers were dropped. Cleared by the next answer. */
  courseForbidden: boolean
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

/** What a Recipe Assistant read left with the review: the candidate photos, the User's photo choice, the note. */
interface ReadExtras {
  photos: ReviewPhoto[]
  choice: PhotoChoice
  note: ReadNoteInfo | undefined
}
const noExtras = (): ReadExtras => ({ photos: [], choice: initialPhotoChoice(), note: undefined })

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
  const [extras, setExtrasState] = useState<ReadExtras>(noExtras)

  // Refs mirror the latest values, so answers given in quick succession build on each other.
  const decisionsRef = useRef<Decisions>(decisions)
  const reviewRef = useRef<Review | undefined>(undefined)
  const extrasRef = useRef<ReadExtras>(extras)
  const seq = useRef(0)

  const track = useCallback(async <T,>(work: () => Promise<T>): Promise<T> => {
    setInFlight((n) => n + 1)
    try {
      return await work()
    } finally {
      setInFlight((n) => n - 1)
    }
  }, [])

  const setExtras = useCallback((next: ReadExtras) => {
    extrasRef.current = next
    setExtrasState(next)
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
        setExtras(noExtras())
        setCurrent({ id: res.id, plan: res.plan })
        setPhase('reviewing')
      } catch (e) {
        setError(readFileError(e))
      }
    },
    [track, setCurrent, setExtras],
  )

  /** Opens the review a finished read made; the server already holds it, so nothing is requested. */
  const adopt = useCallback(
    (read: AdoptedRead) => {
      const next = emptyDecisions()
      decisionsRef.current = next
      setDecisions(next)
      setError(undefined)
      setStale(false)
      setResult(undefined)
      setExtras({
        photos: read.photos ?? [],
        choice: initialPhotoChoice(),
        note: { modelName: read.model?.name, structuredData: read.source?.structuredData === true },
      })
      setCurrent({ id: read.id, plan: read.plan })
      setPhase('reviewing')
    },
    [setCurrent, setExtras],
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
      const { photos, choice } = extrasRef.current
      const options = photoRecipesOf(current.plan, decisionsRef.current)
      const photo = confirmPhoto(normaliseChoice(choice, photos.length, options), photos.length, options)
      const res = await track(() => (photo ? importApi.confirm(current.id, decisionsRef.current, photo) : importApi.confirm(current.id, decisionsRef.current)))
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
    setExtras(noExtras())
    setPhase('source')
  }, [setCurrent, setExtras])

  const photoRecipes = useMemo(() => photoRecipesOf(review?.plan, decisions), [review?.plan, decisions])
  const photoChoice = useMemo(() => normaliseChoice(extras.choice, extras.photos.length, photoRecipes), [extras, photoRecipes])
  const changeChoice = useCallback(
    (change: Partial<PhotoChoice>) => setExtras({ ...extrasRef.current, choice: { ...extrasRef.current.choice, ...change } }),
    [setExtras],
  )

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
    chooseCourseUse: () => {
      throw new Error('not implemented')
    },
    chooseCourseSkip: () => {
      throw new Error('not implemented')
    },
    chooseCourseAdd: () => {
      throw new Error('not implemented')
    },
    chooseCourseUnarchive: () => {
      throw new Error('not implemented')
    },
    courseForbidden: false,
    confirm,
    reset,
    reviewId: review?.id,
    adopt,
    photos: extras.photos,
    photoRecipes,
    photoChoice,
    setPhotoEnabled: (on) => changeChoice({ enabled: on }),
    choosePhoto: (index) => changeChoice({ photo: index }),
    choosePhotoRecipe: (index) => changeChoice({ recipe: index }),
    readNote: extras.note,
  }
}
