import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { TakeOverAsk } from '../../../lib/baseRecipes/types'
import { ApiError } from '../../../lib/http'
import { importApi } from '../api'
import { confirmProblem, type ConfirmProblem } from '../lib/confirmErrors'
import type { ReadNextTarget } from '../lib/confirmFollowUps'
import {
  answerConversion,
  chooseBaseRecipeLine,
  chooseTakeOver,
  chooseCreate,
  chooseCourseAdd,
  chooseCourseSkip,
  chooseCourseUnarchive,
  chooseCourseUse,
  chooseExisting,
  chooseRecipeAction,
  dropAdminCourseAnswers,
  emptyDecisions,
} from '../lib/decisions'
import { readFileError } from '../lib/errors'
import { confirmPhoto, initialPhotoChoice, normaliseChoice, photoRecipes as photoRecipesOf, type PhotoChoice, type PhotoRecipeOption } from '../lib/photoChoice'
import type { AdoptedRead, BaseRecipeAnswer, BaseUnit, Decisions, FileError, ImportResult, Plan, ReadNoteInfo, RecipeAction, ReviewPhoto } from '../types'

/** BR-E: the take-over ask open as a dialog after a Confirm refused it (409 base_recipe_take_over): the tile's path and the Base recipe's name. */
export interface TakeOverPrompt {
  path: string
  baseName: string
  ask: TakeOverAsk
}

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

  // ---- BR-E: Base recipes (docs/dev/design/base-recipes.md §11.3, §13) ----
  /** Answers a Base recipe tile by its line path. Each re-plans like the other answers. */
  chooseBaseRecipeLine: (path: string, answer: BaseRecipeAnswer) => void
  /** Answers a take-over ask by its path (true takes the Ingredient over, false keeps it apart). */
  chooseTakeOver: (path: string, yes: boolean) => void
  /** What the last Confirm refused (cycle, take-over, a refused answer, an unready plan); cleared by the next answer. */
  confirmProblem: ConfirmProblem | undefined
  /** The take-over dialog a Confirm refusal opened; Yes or No answers it and confirms again, Escape saves nothing. */
  takeOverPrompt: TakeOverPrompt | undefined
  answerTakeOverPrompt: (yes: boolean) => void
  cancelTakeOverPrompt: () => void
  /** "Read Béchamel now": starts over at the source step, for a read whose review replaces that Base recipe. */
  startReadNext: (target: ReadNextTarget) => Promise<void>
  /** The Base recipe the next read is for, until Start over or a new file. */
  readNextFor: ReadNextTarget | undefined

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
  const [courseForbidden, setCourseForbidden] = useState(false)
  const [confirmProblemState, setConfirmProblem] = useState<ConfirmProblem | undefined>(undefined)
  const [takeOverPrompt, setTakeOverPrompt] = useState<TakeOverPrompt | undefined>(undefined)
  const [readNextFor, setReadNextFor] = useState<ReadNextTarget | undefined>(undefined)

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
        setConfirmProblem(undefined)
        setTakeOverPrompt(undefined)
        setReadNextFor(undefined)
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
      setCourseForbidden(false)
      setConfirmProblem(undefined)
      setTakeOverPrompt(undefined)
      setReadNextFor(undefined)
      setPhase('reviewing')
    },
    [setCurrent, setExtras],
  )

  /** Applies the answers and asks the server for the plan they lead to; only the latest request is shown. */
  const planFor = useCallback(
    (next: Decisions): Promise<void> => {
      decisionsRef.current = next
      setDecisions(next)
      const current = reviewRef.current
      if (!current) return Promise.resolve()
      const mine = ++seq.current
      return track(() => importApi.plan(current.id, next))
        .then((res) => {
          if (mine === seq.current) setCurrent({ id: res.id, plan: res.plan })
        })
        .catch(() => undefined)
    },
    [track, setCurrent],
  )

  const replan = useCallback((next: Decisions) => void planFor(next), [planFor])

  /** An answer from the User: it also clears the notice of a refused Course answer. */
  const answer = useCallback(
    (next: Decisions) => {
      setCourseForbidden(false)
      setConfirmProblem(undefined)
      replan(next)
    },
    [replan],
  )

  const confirmImport = useCallback(async () => {
    const current = reviewRef.current
    if (!current) return
    setConfirmProblem(undefined)
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
      // CRS E2: an import that added or brought back a Course changes the Courses lists.
      if ((res.coursesCreated ?? 0) > 0 || (res.coursesUnarchived ?? 0) > 0) void client.invalidateQueries({ queryKey: ['courses'] })
    } catch (e) {
      const problem = confirmProblem(e)
      if (problem?.kind === 'takeOver') {
        // BR-E (P7): the ask names the plain Ingredient; the dialog asks the Base recipe whose tile carries that ask.
        const asked = current.plan.takeOvers.find((a) => a.ingredient.id === problem.ask.ingredient.id)
        if (asked) {
          setTakeOverPrompt({ path: asked.path, baseName: asked.name, ask: problem.ask })
          return
        }
        // Round 2: the plan has no ask for it. Plan again with the current answers so the ask shows on its tile; no dialog, no second Confirm.
        await planFor(decisionsRef.current)
        return
      }
      if (problem && (problem.kind !== 'validation' || problem.reason !== undefined)) {
        // BR-E: a refusal that names what to fix (a cycle, a Base recipe refused as planned, an unready plan) stays on the review.
        if (problem.kind === 'notReady') setCurrent({ id: current.id, plan: problem.plan })
        setConfirmProblem(problem)
      } else if (e instanceof ApiError && e.code === 'import_not_ready') {
        setCurrent({ id: current.id, plan: e.details.plan as Plan })
      } else if (e instanceof ApiError && e.code === 'import_stale') {
        setStale(true)
      } else if (e instanceof ApiError && e.code === 'forbidden' && hasAdminCourseAnswers(decisionsRef.current)) {
        // CRS E2: a non-Admin's Confirm with add or unarchive: the Review stays open without them, and the plan is asked again.
        setCourseForbidden(true)
        replan(dropAdminCourseAnswers(decisionsRef.current))
      } else {
        setError(readFileError(e))
      }
    }
  }, [track, client, setCurrent, replan, planFor])

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
    setCourseForbidden(false)
    setConfirmProblem(undefined)
    setTakeOverPrompt(undefined)
    setReadNextFor(undefined)
    setPhase('source')
  }, [setCurrent, setExtras])

  // BR-E: answers the take-over dialog and confirms again with that answer (nothing is saved on Escape).
  const answerTakeOverPrompt = useCallback(
    async (yes: boolean) => {
      if (!takeOverPrompt) return
      const next = chooseTakeOver(decisionsRef.current, takeOverPrompt.path, yes)
      decisionsRef.current = next
      setDecisions(next)
      setTakeOverPrompt(undefined)
      await confirmImport()
    },
    [takeOverPrompt, confirmImport],
  )

  // BR-E: "Read Béchamel now": the review is discarded (its import is saved), and the next read is remembered for the Base recipe.
  const startReadNext = useCallback(
    async (target: ReadNextTarget) => {
      await reset()
      setReadNextFor(target)
    },
    [reset],
  )

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
    chooseCourseUse: (key, courseId) => answer(chooseCourseUse(decisionsRef.current, key, courseId)),
    chooseCourseSkip: (key) => answer(chooseCourseSkip(decisionsRef.current, key)),
    chooseCourseAdd: (key) => answer(chooseCourseAdd(decisionsRef.current, key)),
    chooseCourseUnarchive: (key) => answer(chooseCourseUnarchive(decisionsRef.current, key)),
    courseForbidden,
    confirm: confirmImport,
    reset,
    chooseBaseRecipeLine: (path, a) => answer(chooseBaseRecipeLine(decisionsRef.current, path, a)),
    chooseTakeOver: (path, yes) => answer(chooseTakeOver(decisionsRef.current, path, yes)),
    confirmProblem: confirmProblemState,
    takeOverPrompt,
    answerTakeOverPrompt,
    cancelTakeOverPrompt: () => setTakeOverPrompt(undefined),
    startReadNext,
    readNextFor,
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

/** True when the answers hold an `add` or `unarchive` Course answer (the ones an Admin alone may send). */
function hasAdminCourseAnswers(d: Decisions): boolean {
  return d.courses.some((c) => c.action === 'add' || c.action === 'unarchive')
}
