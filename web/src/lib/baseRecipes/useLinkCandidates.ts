import { useEffect, useMemo, useState } from 'react'
import { useOptionalToast } from '../../ui/Toast'
import { baseRecipesApi } from './api'
import { mergeOffers, type MergeOfferView } from './mergeOffer'
import { linkCandidateRows, linkHeading, linkLabel, linkedToast, tickedLineIds, toggleTick } from './linkCandidateRows'
import { refusalMessage } from './refusals'
import { baseRecipeLinkStrings } from './strings'
import type { LinkCandidate, LinkCandidateRow } from './types'

export interface UseLinkCandidatesOptions {
  baseRecipeId: number
  baseName: string
  /** The Base Unit of the Base recipe's Ingredient ("ml"). */
  baseUnit: string
  /** The Base recipe's Ingredient: what a merge goes into. */
  baseIngredientId: number
  /** The sheet is finished (Not now, or the merge offer answered). */
  onDone: () => void
}

export interface UseLinkCandidates {
  status: 'loading' | 'ready' | 'error'
  /** 'pick' = the list; 'merge' = the offer that follows a link that left an old Ingredient on no line. */
  step: 'pick' | 'merge'
  /** linkHeading(distinct Recipes, the candidates' Ingredient name). */
  heading: string
  rows: LinkCandidateRow[]
  /** linkLabel(ticked). */
  linkLabel: string
  /** False with nothing ticked or while linking. */
  canLink: boolean
  toggle: (lineId: number) => void
  /** POST /link with the ticked lines; success: a Toast "Linked 2 Recipes" with Undo (POST /unlink), then step 'merge' when the server offered one, else onDone. */
  link: () => Promise<void>
  /** Links nothing; calls onDone. */
  notNow: () => void
  /** The merge offer being asked (the first of the server's offer not yet answered); null outside step 'merge'. */
  offer: MergeOfferView | null
  /** Merge: preview first; when blocked (base_unit_mismatch) or it has conflicts nothing is merged and `mergeIssue` says why; else POST merge { into }. Then the next offer, or onDone. */
  merge: () => Promise<void>
  /** Keep it: the next offer, or onDone. Merges nothing. */
  keep: () => void
  mergeIssue: string | null
  /** Words for a failed link (a refusal message or the generic one), or null. */
  error: string | null
}

/** Hook of the LinkCandidatesSheet (design §3.8). Fetches `GET /api/recipes/{id}/link-candidates`; the rows, counts and words come from lib/baseRecipes. */
export function useLinkCandidates(opts: UseLinkCandidatesOptions): UseLinkCandidates {
  const { baseRecipeId, baseName, baseUnit, baseIngredientId, onDone } = opts
  const toast = useOptionalToast()
  const [status, setStatus] = useState<UseLinkCandidates['status']>('loading')
  const [lines, setLines] = useState<LinkCandidate[]>([])
  const [ticked, setTicked] = useState<Set<number>>(() => new Set())
  const [linking, setLinking] = useState(false)
  const [step, setStep] = useState<'pick' | 'merge'>('pick')
  const [offers, setOffers] = useState<MergeOfferView[]>([])
  const [offerIndex, setOfferIndex] = useState(0)
  const [mergeIssue, setMergeIssue] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    baseRecipesApi
      .linkCandidates(baseRecipeId)
      .then((list) => {
        if (cancelled) return
        setLines(list)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [baseRecipeId])

  const rows = useMemo(() => linkCandidateRows(lines, { baseName, baseUnit }, ticked), [lines, baseName, baseUnit, ticked])
  const count = tickedLineIds(rows).length
  const recipeCount = new Set(lines.map((l) => l.recipeId)).size
  const ingredientName = lines[0]?.ingredientName ?? baseName

  // Never silent, and never an empty sheet: with no candidates the sheet closes at once.
  useEffect(() => {
    if (status === 'ready' && lines.length === 0) onDone()
  }, [status, lines.length, onDone])

  const finishOffer = () => {
    if (offerIndex + 1 < offers.length) {
      setOfferIndex(offerIndex + 1)
      setMergeIssue(null)
    } else {
      onDone()
    }
  }

  const link = async () => {
    const ids = tickedLineIds(rows)
    if (ids.length === 0 || linking) return
    setLinking(true)
    setError(null)
    try {
      const result = await baseRecipesApi.link(baseRecipeId, ids)
      const linkedSet = new Set(result.linked)
      const distinct = new Set(lines.filter((l) => linkedSet.has(l.lineId)).map((l) => l.recipeId)).size
      toast?.show(linkedToast(distinct), {
        actionLabel: baseRecipeLinkStrings.undo,
        onAction: () => {
          void baseRecipesApi.unlink(baseRecipeId, result.linked).then(() => setTicked(new Set()))
        },
      })
      if (result.mergeOffer.length > 0) {
        setOffers(mergeOffers(result.mergeOffer, baseName))
        setOfferIndex(0)
        setStep('merge')
      } else {
        onDone()
      }
    } catch (err) {
      setError(refusalMessage(err) ?? baseRecipeLinkStrings.couldNotLink)
    } finally {
      setLinking(false)
    }
  }

  const merge = async () => {
    const current = offers[offerIndex]
    if (!current) return
    setMergeIssue(null)
    try {
      const preview = await baseRecipesApi.mergePreview(current.ingredientId, baseIngredientId)
      if (preview.blocked) {
        setMergeIssue(baseRecipeLinkStrings.differentBaseUnits(current.name, baseName))
        return
      }
      if (preview.conflicts.length > 0) {
        setMergeIssue(baseRecipeLinkStrings.hasConflicts)
        return
      }
      await baseRecipesApi.mergeInto(current.ingredientId, baseIngredientId)
      finishOffer()
    } catch {
      setMergeIssue(baseRecipeLinkStrings.couldNotMerge)
    }
  }

  return {
    status,
    step,
    heading: linkHeading(recipeCount, ingredientName),
    rows,
    linkLabel: linkLabel(count),
    canLink: count > 0 && !linking,
    toggle: (lineId) => setTicked((prev) => toggleTick(prev, lineId, rows)),
    link,
    notNow: onDone,
    offer: step === 'merge' ? (offers[offerIndex] ?? null) : null,
    merge,
    keep: finishOffer,
    mergeIssue,
    error,
  }
}
